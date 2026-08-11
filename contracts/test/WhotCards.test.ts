import { expect } from "chai";
import hre from "hardhat";

const CIRCLE = 1;
const TRIANGLE = 2;
const CROSS = 3;
const SQUARE = 4;
const STAR = 5;
const WHOT = 6;

function pack(shape: number, rank: number): number {
  return (shape << 8) | rank;
}

function cardAt(index: number): number {
  if (index < 12) return pack(CIRCLE, [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14][index]!);
  if (index < 24)
    return pack(TRIANGLE, [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14][index - 12]!);
  if (index < 33) return pack(CROSS, [1, 2, 3, 5, 7, 10, 11, 13, 14][index - 24]!);
  if (index < 42) return pack(SQUARE, [1, 2, 3, 5, 7, 10, 11, 13, 14][index - 33]!);
  if (index < 49) return pack(STAR, [1, 2, 3, 4, 5, 7, 8][index - 42]!);
  return pack(WHOT, 20);
}

describe("WhotCards pack", function () {
  async function deploy() {
    return hre.viem.deployContract("WhotCardsHarness");
  }

  it("has 54 cards", async function () {
    const c = await deploy();
    expect(await c.read.packSize()).to.equal(54);
  });

  it("catalog matches TS for every index", async function () {
    const c = await deploy();
    for (let i = 0; i < 54; i++) {
      const onChain = await c.read.cardAt([BigInt(i)]);
      expect(Number(onChain)).to.equal(cardAt(i));
    }
  });

  it("WHOT is always legal", async function () {
    const c = await deploy();
    const top = pack(1, 7);
    const whot = pack(6, 20);
    expect(await c.read.isLegal([whot, top, 0, 0])).to.equal(true);
  });

  it("must match shape or rank", async function () {
    const c = await deploy();
    const top = pack(1, 7);
    expect(await c.read.isLegal([pack(1, 4), top, 0, 0])).to.equal(true);
    expect(await c.read.isLegal([pack(2, 7), top, 0, 0])).to.equal(true);
    expect(await c.read.isLegal([pack(2, 4), top, 0, 0])).to.equal(false);
  });

  it("pending pick-two only accepts twos", async function () {
    const c = await deploy();
    const top = pack(1, 2);
    expect(await c.read.isLegal([pack(3, 2), top, 0, 2])).to.equal(true);
    expect(await c.read.isLegal([pack(1, 7), top, 0, 2])).to.equal(false);
  });
});
