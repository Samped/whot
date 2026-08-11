// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {euint256, ebool, e, inco, elist, ETypes} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import {WhotCards} from "./WhotCards.sol";

/// @title WHOT — Nigerian matching cards with encrypted hands
/// @notice Multi-table. Each dealt card is `e.allow`ed only to its owner.
///         Cards become public only when played. Inco is TEE-based, not FHE.
contract Whot {
    using e for *;

    uint8 public constant HAND_SIZE = 5;
    uint8 public constant MAX_HAND = 20;
    uint8 public constant PACK = 54;

    enum Phase {
        Empty,
        Waiting,
        Dealing,
        Live,
        Finished
    }

    struct Table {
        Phase phase;
        address player0;
        address player1;
        uint8 turn;
        uint16 topCard;
        uint8 calledShape;
        uint8 pendingPick;
        uint8 pendingKind;
        bool openerReady;
        address winner;
        uint16 nextIndex;
        bytes32 openerHandle;
        bool vsBot;
        bool botPending;
        bytes32 botPackedHandle;
    }

    struct TableView {
        Phase phase_;
        address p0;
        address p1;
        uint8 turn_;
        address toPlay;
        uint16 top;
        uint8 shape;
        uint8 pick;
        uint8 pickKind;
        bool ready;
        address winner_;
        uint8 hand0;
        uint8 hand1;
        uint16 marketLeft;
        bool solo;
        bool botPending_;
    }

    struct Stats {
        uint32 wins;
        uint32 losses;
        uint32 played;
    }

    uint256 public nextTableId;
    mapping(uint256 => Table) private tables;
    mapping(uint256 => elist) private decks;
    mapping(uint256 => mapping(address => euint256[MAX_HAND])) private hands;
    mapping(uint256 => mapping(address => uint8)) public handCount;

    mapping(address => Stats) public stats;
    address[] public ladder;
    mapping(address => bool) public onLadder;
    address public immutable house;

    constructor() {
        house = msg.sender;
    }

    event TableOpened(address indexed host, uint256 indexed id);
    event TableCancelled(uint256 indexed id);
    event Dealt(uint256 indexed id, address a, address b, bytes32 openerHandle);
    event OpenerSet(uint256 indexed id, uint16 card);
    event CardPlayed(uint256 indexed id, address indexed player, uint16 card, uint8 calledShape, string call);
    event Market(uint256 indexed id, address indexed player, uint8 n);
    event CheckUp(uint256 indexed id, address indexed winner);
    event SoloOpened(address indexed player, uint256 indexed id);
    event BotMove(uint256 indexed id, bytes32 packedHandle);

    error WrongPhase();
    error NotSeated();
    error NotYourTurn();
    error InsufficientFee();
    error BadAttestation();
    error HandleMismatch();
    error IllegalCard();
    error NeedShape();
    error HandFull();
    error EmptyMarket();
    error BadIndex();
    error AlreadySeated();
    error NoTable();
    error NotHost();
    error NotHouse();

    modifier seated(uint256 id) {
        Table storage t = tables[id];
        if (msg.sender != t.player0 && msg.sender != t.player1) revert NotSeated();
        _;
    }

    function dealFee() public view returns (uint256) {
        return inco.getEListFee(PACK, ETypes.Uint256) * 2;
    }

    function openTable() external returns (uint256 id) {
        id = ++nextTableId;
        Table storage t = tables[id];
        t.player0 = msg.sender;
        t.phase = Phase.Waiting;
        emit TableOpened(msg.sender, id);
    }

    /// @notice Deal a sealed table against the contract. Your cards are allowed
    ///         only to you. The computer's cards are allowed only to this
    ///         contract. Nothing is public until it is played.
    function openSolo() external payable returns (uint256 id) {
        if (msg.value < dealFee()) revert InsufficientFee();
        id = ++nextTableId;
        Table storage t = tables[id];
        t.player0 = msg.sender;
        t.player1 = address(this);
        t.vsBot = true;
        t.phase = Phase.Dealing;
        _shuffleAndDeal(id);
        t.turn = 0;
        emit SoloOpened(msg.sender, id);
        emit Dealt(id, t.player0, t.player1, t.openerHandle);
    }

    function cancelTable(uint256 id) external {
        Table storage t = tables[id];
        if (t.phase != Phase.Waiting) revert WrongPhase();
        if (msg.sender != t.player0) revert NotHost();
        t.phase = Phase.Empty;
        emit TableCancelled(id);
    }

    function joinAndDeal(uint256 id) external payable {
        Table storage t = tables[id];
        if (t.phase != Phase.Waiting) revert WrongPhase();
        if (msg.sender == t.player0) revert AlreadySeated();
        if (msg.value < dealFee()) revert InsufficientFee();

        t.player1 = msg.sender;
        t.phase = Phase.Dealing;
        _shuffleAndDeal(id);
        emit Dealt(id, t.player0, t.player1, t.openerHandle);
    }

    function _shuffleAndDeal(uint256 id) internal {
        Table storage t = tables[id];
        decks[id] = e.shuffledRange(0, PACK, ETypes.Uint256);
        inco.allow(elist.unwrap(decks[id]), address(this));
        t.nextIndex = 0;

        _dealTo(id, t.player0, HAND_SIZE);
        _dealTo(id, t.player1, HAND_SIZE);

        euint256 opener = e.getEuint256(decks[id], t.nextIndex);
        t.nextIndex += 1;
        opener.allowThis();
        e.reveal(opener);
        t.openerHandle = euint256.unwrap(opener);
        t.turn = 1;
    }

    function lockOpener(uint256 id, DecryptionAttestation calldata att, bytes[] calldata sigs)
        external
    {
        Table storage t = tables[id];
        if (t.phase != Phase.Dealing || t.openerReady) revert WrongPhase();
        if (!inco.incoVerifier().isValidDecryptionAttestation(att, sigs)) revert BadAttestation();
        if (att.handle != t.openerHandle) revert HandleMismatch();

        uint16 card = WhotCards.cardAt(uint256(att.value));
        t.topCard = card;
        if (WhotCards.isWhot(card)) t.calledShape = WhotCards.CIRCLE;
        t.openerReady = true;
        t.phase = Phase.Live;
        emit OpenerSet(id, card);
    }

    function play(
        uint256 id,
        uint8 handIndex,
        DecryptionAttestation calldata att,
        bytes[] calldata sigs,
        uint8 nextShape
    ) external seated(id) {
        Table storage t = tables[id];
        if (t.phase != Phase.Live || !t.openerReady) revert WrongPhase();
        if (msg.sender != _toPlay(t)) revert NotYourTurn();
        uint8 count = handCount[id][msg.sender];
        if (handIndex >= count) revert BadIndex();

        euint256 cardHandle = hands[id][msg.sender][handIndex];
        if (!inco.incoVerifier().isValidDecryptionAttestation(att, sigs)) revert BadAttestation();
        if (att.handle != euint256.unwrap(cardHandle)) revert HandleMismatch();

        uint16 card = WhotCards.cardAt(uint256(att.value));
        if (!WhotCards.isLegal(card, t.topCard, t.calledShape, t.pendingKind)) revert IllegalCard();

        if (WhotCards.isWhot(card)) {
            if (nextShape < WhotCards.CIRCLE || nextShape > WhotCards.STAR) revert NeedShape();
            t.calledShape = nextShape;
        } else {
            t.calledShape = 0;
        }

        e.reveal(cardHandle);
        _removeCard(id, msg.sender, handIndex);
        t.topCard = card;

        string memory call = _applySpecials(id, card, msg.sender);
        emit CardPlayed(id, msg.sender, card, t.calledShape, call);

        if (handCount[id][msg.sender] == 0) {
            t.phase = Phase.Finished;
            t.winner = msg.sender;
            if (!t.vsBot) {
                _record(msg.sender, msg.sender == t.player0 ? t.player1 : t.player0);
            }
            emit CheckUp(id, msg.sender);
        }
    }

    function goMarket(uint256 id) external seated(id) {
        Table storage t = tables[id];
        if (t.phase != Phase.Live) revert WrongPhase();
        if (msg.sender != _toPlay(t)) revert NotYourTurn();

        uint8 n = t.pendingPick == 0 ? 1 : t.pendingPick;
        _dealTo(id, msg.sender, n);
        t.pendingPick = 0;
        t.pendingKind = 0;
        t.turn = 1 - t.turn;
        emit Market(id, msg.sender, n);
    }

    /// @notice House dumps one computer card onto the pile.
    function botDump(
        uint256 id,
        uint8 handIndex,
        DecryptionAttestation calldata att,
        bytes[] calldata sigs,
        uint8 nextShape
    ) external {
        if (msg.sender != house) revert NotHouse();
        Table storage t = tables[id];
        if (!t.vsBot || t.phase != Phase.Live || !t.openerReady) revert WrongPhase();
        if (t.turn != 1 || t.botPending) revert NotYourTurn();
        address bot = address(this);
        if (handIndex >= handCount[id][bot]) revert BadIndex();

        euint256 cardHandle = hands[id][bot][handIndex];
        if (!inco.incoVerifier().isValidDecryptionAttestation(att, sigs)) revert BadAttestation();
        if (att.handle != euint256.unwrap(cardHandle)) revert HandleMismatch();

        uint16 card = WhotCards.cardAt(uint256(att.value));
        if (!WhotCards.isLegal(card, t.topCard, t.calledShape, t.pendingKind)) revert IllegalCard();

        if (WhotCards.isWhot(card)) {
            if (nextShape < WhotCards.CIRCLE || nextShape > WhotCards.STAR) revert NeedShape();
            t.calledShape = nextShape;
        } else {
            t.calledShape = 0;
        }

        e.reveal(cardHandle);
        _removeCard(id, bot, handIndex);
        t.topCard = card;
        string memory call = _applySpecials(id, card, bot);
        emit CardPlayed(id, bot, card, t.calledShape, call);

        if (handCount[id][bot] == 0) {
            t.phase = Phase.Finished;
            t.winner = bot;
            emit CheckUp(id, bot);
        }
    }

    /// @notice House sends the computer to market.
    function botMarket(uint256 id) external {
        if (msg.sender != house) revert NotHouse();
        Table storage t = tables[id];
        if (!t.vsBot || t.phase != Phase.Live || !t.openerReady) revert WrongPhase();
        if (t.turn != 1 || t.botPending) revert NotYourTurn();
        address bot = address(this);
        uint8 n = t.pendingPick == 0 ? 1 : t.pendingPick;
        _dealTo(id, bot, n);
        t.pendingPick = 0;
        t.pendingKind = 0;
        t.turn = 0;
        emit Market(id, bot, n);
    }

    /// @notice Computer turn: pick a legal card with encrypted select (no
    ///         plaintext branch). Packs slot<<8 | catalogIndex and reveals
    ///         only that packed value. Slot 255 means go market.
    function botThink(uint256 id) external {
        Table storage t = tables[id];
        if (!t.vsBot || t.phase != Phase.Live || !t.openerReady) revert WrongPhase();
        if (t.turn != 1 || t.botPending) revert NotYourTurn();

        address bot = address(this);
        uint8 count = handCount[id][bot];
        euint256 packed = e.asEuint256(uint256(255) << 8);
        ebool found = e.asEbool(false);

        for (uint8 i = 0; i < count; i++) {
            ebool legal = _legalEnc(hands[id][bot][i], t.topCard, t.calledShape, t.pendingKind);
            ebool take = e.and(legal, e.not(found));
            euint256 cand = e.add(e.shl(e.asEuint256(i), 8), hands[id][bot][i]);
            packed = e.select(take, cand, packed);
            found = e.or(found, legal);
        }

        packed.allowThis();
        e.reveal(packed);
        t.botPackedHandle = euint256.unwrap(packed);
        t.botPending = true;
        emit BotMove(id, t.botPackedHandle);
    }

    function lockBot(uint256 id, DecryptionAttestation calldata att, bytes[] calldata sigs) external {
        Table storage t = tables[id];
        if (!t.vsBot || !t.botPending || t.phase != Phase.Live) revert WrongPhase();
        if (!inco.incoVerifier().isValidDecryptionAttestation(att, sigs)) revert BadAttestation();
        if (att.handle != t.botPackedHandle) revert HandleMismatch();

        uint256 packed = uint256(att.value);
        uint8 slot = uint8(packed >> 8);
        t.botPending = false;
        t.botPackedHandle = bytes32(0);

        address bot = address(this);
        if (slot == 255) {
            uint8 n = t.pendingPick == 0 ? 1 : t.pendingPick;
            _dealTo(id, bot, n);
            t.pendingPick = 0;
            t.pendingKind = 0;
            t.turn = 0;
            emit Market(id, bot, n);
            return;
        }

        uint16 card = WhotCards.cardAt(packed & 0xff);
        if (slot >= handCount[id][bot]) revert BadIndex();
        if (!WhotCards.isLegal(card, t.topCard, t.calledShape, t.pendingKind)) revert IllegalCard();

        if (WhotCards.isWhot(card)) t.calledShape = WhotCards.CIRCLE;
        else t.calledShape = 0;

        e.reveal(hands[id][bot][slot]);
        _removeCard(id, bot, slot);
        t.topCard = card;
        string memory call = _applySpecials(id, card, bot);
        emit CardPlayed(id, bot, card, t.calledShape, call);

        if (handCount[id][bot] == 0) {
            t.phase = Phase.Finished;
            t.winner = bot;
            emit CheckUp(id, bot);
        }
    }

    /// @dev Public pile is known. Match the sealed catalog index against the
    ///      legal slots only — no 54-way encrypted card lookup per hand card.
    function _legalEnc(euint256 index, uint16 top, uint8 calledShape, uint8 pendingKind)
        internal
        returns (ebool)
    {
        ebool ok = e.asEbool(false);
        for (uint256 i = 0; i < PACK; i++) {
            if (WhotCards.isLegal(WhotCards.cardAt(i), top, calledShape, pendingKind)) {
                ok = e.or(ok, e.eq(index, i));
            }
        }
        return ok;
    }

    function _applySpecials(uint256 id, uint16 card, address actor) internal returns (string memory call) {
        Table storage t = tables[id];
        uint8 rank = WhotCards.rankOf(card);
        address foe = actor == t.player0 ? t.player1 : t.player0;

        if (rank == 2) {
            t.pendingPick += 2;
            t.pendingKind = 2;
            t.turn = 1 - t.turn;
            return "Pick two!";
        }
        if (rank == 5) {
            t.pendingPick += 3;
            t.pendingKind = 5;
            t.turn = 1 - t.turn;
            return "Pick three!";
        }
        if (rank == 1) {
            t.pendingPick = 0;
            t.pendingKind = 0;
            return "Hold on!";
        }
        if (rank == 8) {
            t.pendingPick = 0;
            t.pendingKind = 0;
            return "Suspension!";
        }
        if (rank == 14) {
            t.pendingPick = 0;
            t.pendingKind = 0;
            _dealTo(id, foe, 1);
            emit Market(id, foe, 1);
            return "General market!";
        }
        if (rank == 20) {
            t.pendingPick = 0;
            t.pendingKind = 0;
            t.turn = 1 - t.turn;
            return "WHOT!";
        }
        t.pendingPick = 0;
        t.pendingKind = 0;
        t.turn = 1 - t.turn;
        return "";
    }

    function _dealTo(uint256 id, address player, uint8 n) internal {
        Table storage t = tables[id];
        for (uint8 i = 0; i < n; i++) {
            if (t.nextIndex >= PACK) revert EmptyMarket();
            uint8 count = handCount[id][player];
            if (count >= MAX_HAND) revert HandFull();
            euint256 card = e.getEuint256(decks[id], t.nextIndex);
            t.nextIndex += 1;
            card.allowThis();
            card.allow(player);
            if (player == address(this)) card.allow(house);
            hands[id][player][count] = card;
            handCount[id][player] = count + 1;
        }
    }

    function _removeCard(uint256 id, address player, uint8 index) internal {
        uint8 last = handCount[id][player] - 1;
        if (index != last) {
            hands[id][player][index] = hands[id][player][last];
        }
        handCount[id][player] = last;
    }

    function _toPlay(Table storage t) internal view returns (address) {
        return t.turn == 0 ? t.player0 : t.player1;
    }

    function _track(address player) internal {
        if (player == address(0) || onLadder[player]) return;
        onLadder[player] = true;
        ladder.push(player);
    }

    function _record(address win, address lose) internal {
        Stats storage w = stats[win];
        w.wins += 1;
        w.played += 1;
        Stats storage l = stats[lose];
        l.losses += 1;
        l.played += 1;
        _track(win);
        _track(lose);
    }

    function mySeat(uint256 id) external view returns (int8) {
        Table storage t = tables[id];
        if (msg.sender == t.player0) return 0;
        if (msg.sender == t.player1) return 1;
        return -1;
    }

    function openerOf(uint256 id) external view returns (bytes32) {
        return tables[id].openerHandle;
    }

    function getHandHandles(uint256 id, address player) external view returns (bytes32[] memory out) {
        uint8 n = handCount[id][player];
        out = new bytes32[](n);
        for (uint8 i = 0; i < n; i++) {
            out[i] = euint256.unwrap(hands[id][player][i]);
        }
    }

    function table(uint256 id) external view returns (TableView memory v) {
        Table storage t = tables[id];
        if (t.phase == Phase.Empty) revert NoTable();
        v.phase_ = t.phase;
        v.p0 = t.player0;
        v.p1 = t.player1;
        v.turn_ = t.turn;
        v.toPlay = t.phase == Phase.Live ? _toPlay(t) : address(0);
        v.top = t.topCard;
        v.shape = WhotCards.neededShape(t.topCard, t.calledShape);
        v.pick = t.pendingPick;
        v.pickKind = t.pendingKind;
        v.ready = t.openerReady;
        v.winner_ = t.winner;
        v.hand0 = handCount[id][t.player0];
        v.hand1 = handCount[id][t.player1];
        v.marketLeft = PACK > t.nextIndex ? PACK - t.nextIndex : 0;
        v.solo = t.vsBot;
        v.botPending_ = t.botPending;
    }

    function botPackedOf(uint256 id) external view returns (bytes32) {
        return tables[id].botPackedHandle;
    }

    function ladderLength() external view returns (uint256) {
        return ladder.length;
    }

    function getLadder(uint256 offset, uint256 limit)
        external
        view
        returns (
            address[] memory players,
            uint32[] memory wins,
            uint32[] memory losses,
            uint32[] memory played
        )
    {
        uint256 len = ladder.length;
        if (offset >= len) {
            return (new address[](0), new uint32[](0), new uint32[](0), new uint32[](0));
        }
        uint256 end = offset + limit;
        if (end > len) end = len;
        uint256 n = end - offset;
        players = new address[](n);
        wins = new uint32[](n);
        losses = new uint32[](n);
        played = new uint32[](n);
        for (uint256 i = 0; i < n; i++) {
            address p = ladder[offset + i];
            Stats storage s = stats[p];
            players[i] = p;
            wins[i] = s.wins;
            losses[i] = s.losses;
            played[i] = s.played;
        }
    }
}
