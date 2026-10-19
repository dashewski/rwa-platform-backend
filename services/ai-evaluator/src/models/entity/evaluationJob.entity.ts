import type { InferSchemaType } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

const evaluationJobSchema = new Schema({
  entityType: { type: String, enum: ['pool', 'business'], required: true },
  entityId: { type: String, required: true },
  params: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
  result: { type: Schema.Types.Mixed, default: null },
  attempts: { type: Number, default: 0 },
}, { timestamps: true, collection: 'evaluation_jobs' });

export type EvaluationJob = InferSchemaType<typeof evaluationJobSchema>;
export const EvaluationJobEntity = mongoose.model('EvaluationJob', evaluationJobSchema);
