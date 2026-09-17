/**
 * Tenant repository.
 *
 * Tenants are resolved by slug at login because the staff login form takes a hospital slug, not a
 * tenant id. Every other path derives the tenant from the authenticated principal instead, so this
 * lookup exists only for the one endpoint that legitimately runs before authentication.
 */

import type { AppDatabase } from '../../db/kysely';
import type { TenantRow } from '../../db/schema';

export interface TenantBranding {
  readonly primaryColor: string;
  readonly logoText: string;
}

const DEFAULT_BRANDING: TenantBranding = { primaryColor: '#0F766E', logoText: 'MediKiosk' };

export async function findTenantBySlug(
  db: AppDatabase,
  slug: string,
): Promise<TenantRow | undefined> {
  return db
    .selectFrom('tenants')
    .selectAll()
    .where('slug', '=', slug)
    .where('deletedAt', 'is', null)
    .executeTakeFirst();
}

/** Parse tenant branding, falling back to defaults rather than failing a login over cosmetics. */
export function parseBranding(brandingJson: string): TenantBranding {
  try {
    const parsed = JSON.parse(brandingJson) as Partial<TenantBranding>;
    return {
      primaryColor: typeof parsed.primaryColor === 'string' ? parsed.primaryColor : DEFAULT_BRANDING.primaryColor,
      logoText: typeof parsed.logoText === 'string' ? parsed.logoText : DEFAULT_BRANDING.logoText,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** Locales a tenant enables. Defaults to English only, so a half-configured tenant is not multilingual. */
export function parseEnabledLocales(localesJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(localesJson) as unknown;
    if (!Array.isArray(parsed)) return ['en-IN'];
    const locales = parsed.filter((entry): entry is string => typeof entry === 'string');
    return locales.length > 0 ? locales : ['en-IN'];
  } catch {
    return ['en-IN'];
  }
}