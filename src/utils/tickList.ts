import JSBI from 'jsbi'
import invariant from 'tiny-invariant'
import { ZERO } from '../internalConstants'
import { isSorted } from './isSorted'
import { Tick } from '../entities/tick'

function tickComparator(a: Tick, b: Tick) {
  return a.index - b.index
}

/**
 * Utility methods for interacting with sorted lists of ticks
 */
export abstract class TickList {
  /**
   * Cannot be constructed
   */
  private constructor() {}

  public static validate(ticks: Tick[], tickSpacing: number) {
    // ensure ticks are spaced appropriately
    invariant(
      ticks.every(({ index }) => index % tickSpacing === 0),
      'TICK_SPACING'
    )

    // ensure tick liquidity deltas sum to 0
    invariant(
      JSBI.equal(
        ticks.reduce((accumulator, { liquidityNet }) => JSBI.add(accumulator, liquidityNet), ZERO),
        ZERO
      ),
      'ZERO_NET'
    )

    invariant(isSorted(ticks, tickComparator), 'SORTED')
  }

  public static isBelowSmallest(ticks: Tick[], tick: number): boolean {
    invariant(ticks.length > 0, 'LENGTH')
    return tick < ticks[0].index
  }

  public static isAtOrAboveLargest(ticks: Tick[], tick: number): boolean {
    invariant(ticks.length > 0, 'LENGTH')
    return tick >= ticks[ticks.length - 1].index
  }

  public static getTick(ticks: Tick[], index: number): Tick {
    const tick = ticks[this.binarySearch(ticks, index)]
    invariant(tick.index === index, 'NOT_CONTAINED')
    return tick
  }

  private static binarySearch(ticks: Tick[], tick: number): number {
    invariant(!this.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST')
    invariant(!this.isAtOrAboveLargest(ticks, tick), 'AT_OR_ABOVE_LARGEST')

    let l = 0
    let r = ticks.length - 1
    let i
    while (true) {
      i = Math.floor((l + r) / 2)

      if (ticks[i].index <= tick && ticks[i + 1].index > tick) {
        return i
      }

      if (ticks[i].index < tick) {
        l = i + 1
      } else {
        r = i - 1
      }
    }
  }

  public static nextInitializedTick(ticks: Tick[], tick: number, lte: boolean): Tick {
    if (lte) {
      invariant(!TickList.isBelowSmallest(ticks, tick), 'BELOW_SMALLEST')
      if (TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1]
      }
      const index = this.binarySearch(ticks, tick)
      return ticks[index]
    } else {
      invariant(!this.isAtOrAboveLargest(ticks, tick), 'AT_OR_ABOVE_LARGEST')
      if (this.isBelowSmallest(ticks, tick)) {
        return ticks[0]
      }
      const index = this.binarySearch(ticks, tick)
      return ticks[index + 1]
    }
  }

  public static nextInitializedTickWithinOneWord(
    ticks: Tick[],
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): [number, boolean] {
    const compressed = Math.floor(tick / tickSpacing) // matches rounding in the code

    if (lte) {
      const wordPos = compressed >> 8
      const minimum = (wordPos << 8) * tickSpacing

      if (TickList.isBelowSmallest(ticks, tick)) {
        return [minimum, false]
      }

      const index = TickList.nextInitializedTick(ticks, tick, lte).index
      const nextInitializedTick = Math.max(minimum, index)
      return [nextInitializedTick, nextInitializedTick === index]
    } else {
      const wordPos = (compressed + 1) >> 8
      const maximum = ((wordPos + 1) << 8) * tickSpacing - 1

      if (this.isAtOrAboveLargest(ticks, tick)) {
        return [maximum, false]
      }

      const index = this.nextInitializedTick(ticks, tick, lte).index
      const nextInitializedTick = Math.min(maximum, index)
      return [nextInitializedTick, nextInitializedTick === index]
    }
  }
}
