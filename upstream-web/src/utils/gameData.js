import gameIndex from "@/assets/game-data/game_index.json";
import palWorkIndex from "@/assets/game-data/pal_work_index.json";
import palDetailIndex from "@/assets/game-data/pal_detail_index.json";
import palPartnerIndex from "@/assets/game-data/pal_partner_index.json";
import { makeMetadataContext, normalizeInventory, normalizePal } from "./gameDataCore";

export const gameDataContext = makeMetadataContext({
  game: gameIndex,
  work: palWorkIndex,
  detail: palDetailIndex,
  partner: palPartnerIndex,
});

export const enrichPals = (pals) => pals.map((pal) => normalizePal(pal, gameDataContext));
export const enrichInventory = (items) => normalizeInventory(items, gameDataContext);
export const palPortrait = (palId) =>
  new URL(`../assets/pals/${String(palId).toLowerCase()}.png`, import.meta.url).href;
export const itemIcon = (itemId) =>
  new URL(`../assets/items/${String(itemId).toLowerCase()}.webp`, import.meta.url).href;
