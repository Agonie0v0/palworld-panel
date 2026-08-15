import gameIndex from "@/assets/game-data/game_index.json";
import palWorkIndex from "@/assets/game-data/pal_work_index.json";
import palDetailIndex from "@/assets/game-data/pal_detail_index.json";
import palPartnerIndex from "@/assets/game-data/pal_partner_index.json";
import palSpeciesIndex from "@/assets/game-data/pal_species_index.json";
import workerPalIndex from "@/assets/game-data/worker_pal_index.json";
import { makeMetadataContext, normalizeInventory, normalizePal } from "./gameDataCore";

export const gameDataContext = makeMetadataContext({
  game: gameIndex,
  work: palWorkIndex,
  detail: palDetailIndex,
  partner: palPartnerIndex,
  species: palSpeciesIndex,
  workers: workerPalIndex,
});

export const enrichPals = (pals) => pals.map((pal) => normalizePal(pal, gameDataContext));
export const enrichInventory = (items) => normalizeInventory(items, gameDataContext);
const hdPalPortraits = import.meta.glob("../assets/pals-hd/*.webp", {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

export const palPortrait = (palId) => {
  const key = String(palId).replace(/^BOSS_/i, "boss_").toLowerCase();
  return (
    hdPalPortraits[`../assets/pals-hd/${key}.webp`] ||
    new URL(`../assets/pals/${key}.png`, import.meta.url).href
  );
};
export const itemIcon = (itemId) =>
  new URL(`../assets/items/${String(itemId).toLowerCase()}.webp`, import.meta.url).href;
