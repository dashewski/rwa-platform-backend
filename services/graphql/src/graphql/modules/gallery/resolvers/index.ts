import type { Resolvers } from '../../../generated/types';
import { getGallery } from './queries/getGallery';
import { getGalleries } from './queries/getGalleries';
import { getImage } from './queries/getImage';
import { getImages } from './queries/getImages';
import { createGallery } from './mutations/createGallery';
import { updateGallery } from './mutations/updateGallery';
import { deleteGallery } from './mutations/deleteGallery';
import { updateImage } from './mutations/updateImage';
import { deleteImage } from './mutations/deleteImage';

export const galleryResolvers: Resolvers = {
  Query: {
    getGallery,
    getGalleries,
    getImage,
    getImages,
  },
  Mutation: {
    createGallery,
    updateGallery,
    deleteGallery,
    updateImage,
    deleteImage,
  },
};
