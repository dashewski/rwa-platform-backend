import { FaucetCooldownEntity } from '../models/entity/faucetCooldown.entity';
import { TraceDecorator } from '@shared/monitoring/src/traceDecorator';

export type FaucetCooldownClaim =
  | { claimed: true; previousUnlockAt: number | null }
  | { claimed: false; unlockAt: number };

export class FaucetCooldownRepository {
  @TraceDecorator()
  async findUnlockAt(key: string) {
    const cooldown = await FaucetCooldownEntity.findOne({ key }).lean();

    return cooldown?.unlockAt ?? null;
  }

  @TraceDecorator()
  async claim(data: { key: string; now: number; unlockAt: number }): Promise<FaucetCooldownClaim> {
    const previous = await FaucetCooldownEntity.findOneAndUpdate(
      { key: data.key, unlockAt: { $lte: data.now } },
      { $set: { unlockAt: data.unlockAt } },
      { returnDocument: 'before' },
    ).lean();

    if (previous) {
      return { claimed: true, previousUnlockAt: previous.unlockAt };
    }

    try {
      await FaucetCooldownEntity.create({ key: data.key, unlockAt: data.unlockAt });

      return { claimed: true, previousUnlockAt: null };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) {
        throw error;
      }

      const current = await FaucetCooldownEntity.findOne({ key: data.key }).lean();

      return { claimed: false, unlockAt: current?.unlockAt ?? data.unlockAt };
    }
  }

  @TraceDecorator()
  async release(data: { key: string; previousUnlockAt: number | null }) {
    if (data.previousUnlockAt === null) {
      await FaucetCooldownEntity.deleteOne({ key: data.key });

      return;
    }

    await FaucetCooldownEntity.updateOne({ key: data.key }, { $set: { unlockAt: data.previousUnlockAt } });
  }
}
