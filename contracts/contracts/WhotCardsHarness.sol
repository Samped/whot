// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {WhotCards} from "./WhotCards.sol";

contract WhotCardsHarness {
    function cardAt(uint256 index) external pure returns (uint16) {
        return WhotCards.cardAt(index);
    }

    function pack(uint8 shape, uint8 rank) external pure returns (uint16) {
        return WhotCards.pack(shape, rank);
    }

    function isLegal(uint16 card, uint16 top, uint8 calledShape, uint8 pendingKind)
        external
        pure
        returns (bool)
    {
        return WhotCards.isLegal(card, top, calledShape, pendingKind);
    }

    function packSize() external pure returns (uint8) {
        return WhotCards.PACK;
    }
}
