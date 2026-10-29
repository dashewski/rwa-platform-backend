import type { Resolvers } from '../../../generated/types';
import { createAssistant } from './mutations/createAssistant';
import { createMessage } from './mutations/createMessage';
import { deleteAssistant } from './mutations/deleteAssistant';
import { deleteMessage } from './mutations/deleteMessage';
import { updateAssistant } from './mutations/updateAssistant';
import { updateMessage } from './mutations/updateMessage';
import { getAssistant } from './queries/getAssistant';
import { getMessage } from './queries/getMessage';
import { getMessageHistory } from './queries/getMessageHistory';
import { getUserAssistants } from './queries/getUserAssistants';

export const aiAssistantResolvers: Resolvers = {
  Query: {
    getAssistant,
    getUserAssistants,
    getMessage,
    getMessageHistory,
  },
  Mutation: {
    createAssistant,
    updateAssistant,
    deleteAssistant,
    createMessage,
    updateMessage,
    deleteMessage,
  },
};
