import { expect, it } from "vitest";

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => parseInt(part, 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

it("keeps active navigation text at WCAG AA contrast in light and dark themes", () => {
  expect(contrast("#0b4f8a", "#f7faff")).toBeGreaterThanOrEqual(4.5);
  expect(contrast("#b6ef55", "#16171c")).toBeGreaterThanOrEqual(4.5);
});
