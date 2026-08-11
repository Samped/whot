// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Canonical 54-card Nigerian WHOT pack.
/// Card id = (shape << 8) | rank. Shapes: 1 circle, 2 triangle, 3 cross, 4 square, 5 star, 6 whot.
library WhotCards {
    uint8 internal constant CIRCLE = 1;
    uint8 internal constant TRIANGLE = 2;
    uint8 internal constant CROSS = 3;
    uint8 internal constant SQUARE = 4;
    uint8 internal constant STAR = 5;
    uint8 internal constant WHOT = 6;
    uint8 internal constant PACK = 54;

    function pack(uint8 shape, uint8 rank) internal pure returns (uint16) {
        return (uint16(shape) << 8) | uint16(rank);
    }

    function shapeOf(uint16 card) internal pure returns (uint8) {
        return uint8(card >> 8);
    }

    function rankOf(uint16 card) internal pure returns (uint8) {
        return uint8(card);
    }

    function isWhot(uint16 card) internal pure returns (bool) {
        return rankOf(card) == 20;
    }

    /// @dev Index 0..53 → card id. Must stay byte-identical to `frontend/lib/whot.ts`.
    function cardAt(uint256 index) internal pure returns (uint16) {
        require(index < PACK, "card");
        unchecked {
            if (index < 12) return _circleTriangle(CIRCLE, index);
            if (index < 24) return _circleTriangle(TRIANGLE, index - 12);
            if (index < 33) return _crossSquare(CROSS, index - 24);
            if (index < 42) return _crossSquare(SQUARE, index - 33);
            if (index < 49) {
                uint8[7] memory stars = [1, 2, 3, 4, 5, 7, 8];
                return pack(STAR, stars[index - 42]);
            }
            return pack(WHOT, 20);
        }
    }

    function _circleTriangle(uint8 shape, uint256 i) private pure returns (uint16) {
        uint8[12] memory ranks = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14];
        return pack(shape, ranks[i]);
    }

    function _crossSquare(uint8 shape, uint256 i) private pure returns (uint16) {
        uint8[9] memory ranks = [1, 2, 3, 5, 7, 10, 11, 13, 14];
        return pack(shape, ranks[i]);
    }

    function neededShape(uint16 top, uint8 calledShape) internal pure returns (uint8) {
        if (calledShape != 0) return calledShape;
        return shapeOf(top);
    }

    function isLegal(uint16 card, uint16 top, uint8 calledShape, uint8 pendingKind) internal pure returns (bool) {
        if (pendingKind == 2) return rankOf(card) == 2;
        if (pendingKind == 5) return rankOf(card) == 5;
        if (isWhot(card)) return true;
        if (top == 0) return true;
        return shapeOf(card) == neededShape(top, calledShape) || rankOf(card) == rankOf(top);
    }
}
