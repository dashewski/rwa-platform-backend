import type { Resolvers } from '../../../generated/types';
import { getBlog } from './queries/getBlog';
import { getBlogs } from './queries/getBlogs';
import { getPost } from './queries/getPost';
import { getPosts } from './queries/getPosts';
import { createBlog } from './mutations/createBlog';
import { updateBlog } from './mutations/updateBlog';
import { deleteBlog } from './mutations/deleteBlog';
import { createPost } from './mutations/createPost';
import { updatePost } from './mutations/updatePost';
import { deletePost } from './mutations/deletePost';

export const blogResolvers: Resolvers = {
  Query: {
    getBlog,
    getBlogs,
    getPost,
    getPosts,
  },
  Mutation: {
    createBlog,
    updateBlog,
    deleteBlog,
    createPost,
    updatePost,
    deletePost,
  },
};
