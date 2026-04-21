import type { Post } from "@/lib/supabase";

export function canViewPost(
  post: Pick<Post, "user_id" | "visibility">,
  viewerId: string | null | undefined,
  followedIds?: Set<string>
) {
  if (post.visibility !== "followers") return true;
  if (!viewerId) return false;
  if (post.user_id === viewerId) return true;
  return followedIds?.has(post.user_id) ?? false;
}

export function filterVisiblePosts(
  posts: Post[],
  viewerId: string | null | undefined,
  followedIds?: Set<string>
) {
  return posts.filter((post) => canViewPost(post, viewerId, followedIds));
}
