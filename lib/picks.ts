// Dynasty rookie draft picks, valued on the same 0–100 scale as dynasty player values.
// Pure, so the trade calculator can import it on the client.

export const PICK_ROUNDS = 4;
export const PICK_SLOTS = ["Early", "Mid", "Late"] as const;
export type PickSlot = (typeof PICK_SLOTS)[number];

// Calibrated against dynasty player values: an early 1st ≈ a top-15 dynasty WR,
// a late 1st ≈ a WR24, and 3rds/4ths are roster filler
const BASE_VALUES: Record<number, Record<PickSlot, number>> = {
  1: { Early: 36, Mid: 28, Late: 21 },
  2: { Early: 14, Mid: 11, Late: 9 },
  3: { Early: 6, Mid: 5, Late: 4 },
  4: { Early: 3, Mid: 2.5, Late: 2 },
};

// Picks further out are worth less: longer wait, and the slot is still a guess
const FUTURE_YEAR_DISCOUNT = 0.85;

// Rookie QBs start for Superflex teams, which pushes up the price of 1sts and 2nds
const SUPERFLEX_BOOST: Record<number, number> = { 1: 1.12, 2: 1.06, 3: 1, 4: 1 };

export type DraftPick = {
  id: string;
  name: string;
  year: number;
  round: number;
  slot: PickSlot;
  value: number;
};

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

export function buildPicks(firstDraftYear: number, superflex: boolean, years = 3): DraftPick[] {
  const picks: DraftPick[] = [];
  for (let y = 0; y < years; y++) {
    const year = firstDraftYear + y;
    for (let round = 1; round <= PICK_ROUNDS; round++) {
      for (const slot of PICK_SLOTS) {
        const value = BASE_VALUES[round][slot] * FUTURE_YEAR_DISCOUNT ** y * (superflex ? SUPERFLEX_BOOST[round] : 1);
        picks.push({
          id: `pick-${year}-${round}-${slot.toLowerCase()}`,
          name: `${year} ${slot} ${ORDINAL[round]}`,
          year,
          round,
          slot,
          value: Math.round(value * 10) / 10,
        });
      }
    }
  }
  return picks;
}
