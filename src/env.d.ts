/// <reference types="astro/client" />

type AppwriteUser = import('node-appwrite').Models.User<Record<string, any>>;

declare namespace App {
  interface Locals {
    /** The Appwrite user attached to the current session, or null when logged out. */
    user: AppwriteUser | null;
  }
}
