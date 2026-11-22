import type { components } from "./schema";

type S = components["schemas"];
export type User = S["UserPublic"];
export type Wish = S["WishOut"];
export type WishCreate = S["WishCreate"];
export type WishUpdate = S["WishUpdate"];
export type TokenResponse = S["TokenResponse"];
export type SetupUser = S["SetupUser"];
