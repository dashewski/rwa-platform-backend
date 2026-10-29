import { redisClient } from '../clients/redis.client';
import { authClient, companyClient, rwaClient } from '../clients/eden.clients';
import { OwnershipService } from '@shared/ownership/src/ownership.service';
import { ParentService } from './parent.service';
import { ValidationService } from './validation.service';
import { SessionsJwt } from '@shared/sessions/src/sessionsJwt';
import { CONFIG } from '../config';

export const ownershipService = new OwnershipService(redisClient, companyClient, authClient);
export const parentService = new ParentService(rwaClient);
export const validationService = new ValidationService();
export const sessionsJwt = new SessionsJwt(CONFIG.JWT_SECRET);
