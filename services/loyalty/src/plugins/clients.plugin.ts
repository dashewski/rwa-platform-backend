import { Elysia } from 'elysia';
import { createSignersManagerClient } from '../clients/eden.clients';
import { withTraceSync } from '@shared/monitoring/src/tracing';

export const createClientsPlugin = async (signersManagerUrl: string) => {
  const signersManagerClient = withTraceSync('loyalty.init.clients.signers_manager', () =>
    createSignersManagerClient(signersManagerUrl),
  );

  const plugin = withTraceSync('loyalty.init.clients.plugin', () =>
    new Elysia({ name: 'Clients' }).decorate('signersManagerClient', signersManagerClient),
  );

  return plugin;
};

export type ClientsPlugin = Awaited<ReturnType<typeof createClientsPlugin>>;
