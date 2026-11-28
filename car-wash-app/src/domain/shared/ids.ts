declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Brand<string, "UserId">;
export type LocationId = Brand<string, "LocationId">;
export type BayId = Brand<string, "BayId">;
export type PackageId = Brand<string, "PackageId">;
export type BookingId = Brand<string, "BookingId">;

/** Only call at trust boundaries after validation (Zod, DB rows). */
export const asId = <T extends Brand<string, string>>(raw: string): T => raw as T;
