import mongoose, { Schema, Types } from 'mongoose';
import type { InferRawDocType } from 'mongoose';

const permissionSchemaDefinition = {
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  memberId: {
    type: Schema.Types.ObjectId,
    ref: 'Member',
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  permission: {
    type: String,
    required: true,
  },
  entity: {
    type: String,
    default: '*',
  },
  createdAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
  updatedAt: {
    type: Number,
    default: () => Math.floor(Date.now() / 1000),
  },
} as const;

const permissionSchema = new Schema(permissionSchemaDefinition, {
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
});

permissionSchema.index({ memberId: 1, permission: 1, entity: 1 }, { unique: true });

permissionSchema.index({ memberId: 1 });
permissionSchema.index({ companyId: 1 });

export type IPermissionEntity = InferRawDocType<typeof permissionSchemaDefinition> & {
  _id: Types.ObjectId;
};
export const PermissionEntity = mongoose.model('Permission', permissionSchema);
