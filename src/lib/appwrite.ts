import { Client, Account, TablesDB, Storage } from 'node-appwrite';
import { config } from './config';

/**
 * Appwrite client factories.
 *
 * - The admin client authenticates with the server API key and is used for
 *   privileged operations (creating tokens, provisioning, reading public
 *   site data).
 * - The user client authenticates with a session secret (from our cookie)
 *   and acts on behalf of the logged-in user.
 *
 * Note: we use the modern TablesDB API (tables / columns / rows), which
 * replaced the older Databases API (collections / attributes / documents).
 */

export type AdminServices = {
  client: Client;
  account: Account;
  tables: TablesDB;
  storage: Storage;
};

let cached: AdminServices | null = null;

export function getAdminServices(): AdminServices {
  if (!cached) {
    const client = new Client()
      .setEndpoint(config.appwrite.endpoint)
      .setProject(config.appwrite.projectId)
      .setKey(config.appwrite.apiKey);
    cached = {
      client,
      account: new Account(client),
      tables: new TablesDB(client),
      storage: new Storage(client),
    };
  }
  return cached;
}

export function getUserServices(sessionSecret: string): AdminServices {
  const client = new Client()
    .setEndpoint(config.appwrite.endpoint)
    .setProject(config.appwrite.projectId)
    .setSession(sessionSecret);
  return {
    client,
    account: new Account(client),
    tables: new TablesDB(client),
    storage: new Storage(client),
  };
}
