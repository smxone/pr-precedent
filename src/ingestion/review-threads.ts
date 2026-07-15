import { octokit } from "../lib/github.js";
import type { ResolvedReviewThread, ResolvedReviewThreadComment } from "../types/index.js";

interface GraphComment {
  id: string;
  databaseId: number | null;
  body: string;
  url: string;
  diffHunk: string;
  author: { __typename: string; login: string } | null;
}

interface GraphThread {
  id: string;
  path: string;
  line: number | null;
  startLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  comments: {
    nodes: GraphComment[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

interface ThreadPage {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: GraphThread[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  } | null;
}

interface CommentPage {
  node: {
    comments: {
      nodes: GraphComment[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

const THREADS_QUERY = `
  query PrecedentReviewThreads($owner: String!, $repo: String!, $pullNumber: Int!, $after: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pullNumber) {
        reviewThreads(first: 100, after: $after) {
          nodes {
            id path line startLine isResolved isOutdated
            comments(first: 100) {
              nodes { id databaseId body url diffHunk author { __typename login } }
              pageInfo { hasNextPage endCursor }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

const COMMENTS_QUERY = `
  query PrecedentReviewThreadComments($threadId: ID!, $after: String) {
    node(id: $threadId) {
      ... on PullRequestReviewThread {
        comments(first: 100, after: $after) {
          nodes { id databaseId body url diffHunk author { __typename login } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

function normalizeComment(comment: GraphComment): ResolvedReviewThreadComment {
  return {
    id: comment.id,
    databaseId: comment.databaseId,
    body: comment.body,
    url: comment.url,
    diffHunk: comment.diffHunk,
    isBot: comment.author?.__typename === "Bot" || comment.author?.login.endsWith("[bot]") === true,
  };
}

async function fetchRemainingComments(thread: GraphThread): Promise<GraphComment[]> {
  const comments = [...thread.comments.nodes];
  let pageInfo = thread.comments.pageInfo;
  while (pageInfo.hasNextPage) {
    const page: CommentPage = await octokit.graphql(COMMENTS_QUERY, {
      threadId: thread.id,
      after: pageInfo.endCursor,
    });
    if (!page.node) throw new Error(`Review thread ${thread.id} disappeared while comments were paginated`);
    comments.push(...page.node.comments.nodes);
    pageInfo = page.node.comments.pageInfo;
  }
  return comments;
}

export async function fetchResolvedReviewThreads(params: {
  owner: string;
  repo: string;
  pullNumber: number;
}): Promise<ResolvedReviewThread[]> {
  const threads: ResolvedReviewThread[] = [];
  let after: string | null = null;

  while (true) {
    const page: ThreadPage = await octokit.graphql(THREADS_QUERY, {
      owner: params.owner,
      repo: params.repo,
      pullNumber: params.pullNumber,
      after,
    });
    const connection = page.repository?.pullRequest?.reviewThreads;
    if (!connection) throw new Error(`Pull request ${params.owner}/${params.repo}#${params.pullNumber} was not found`);

    for (const thread of connection.nodes) {
      const comments = await fetchRemainingComments(thread);
      threads.push({
        id: thread.id,
        path: thread.path,
        line: thread.line,
        startLine: thread.startLine,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: comments.map(normalizeComment),
      });
    }

    if (!connection.pageInfo.hasNextPage) return threads;
    after = connection.pageInfo.endCursor;
  }
}
