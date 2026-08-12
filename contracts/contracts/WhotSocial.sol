// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Profiles and directed table invites for WHOT.
contract WhotSocial {
    uint8 public constant MAX_AVATAR = 5;
    uint8 public constant MAX_NAME = 20;
    uint8 public constant MAX_EMAIL = 64;
    uint8 public constant MAX_OPEN_INVITES = 12;

    struct Profile {
        string nickname;
        uint8 avatar;
        string email;
        bool set;
    }

    struct Invite {
        address from;
        uint256 tableId;
        uint64 createdAt;
        bool open;
    }

    mapping(address => Profile) private profiles;
    mapping(address => Invite[]) private inbox;

    event ProfileSet(address indexed player, string nickname, uint8 avatar);
    event Invited(address indexed to, address indexed from, uint256 indexed tableId, uint256 inviteIndex);
    event InviteClosed(address indexed to, uint256 inviteIndex);

    error BadName();
    error BadAvatar();
    error BadEmail();
    error BadInvite();
    error InboxFull();

    function setProfile(string calldata nickname, uint8 avatar, string calldata email) external {
        bytes memory nick = bytes(nickname);
        if (nick.length == 0 || nick.length > MAX_NAME) revert BadName();
        if (avatar > MAX_AVATAR) revert BadAvatar();
        if (bytes(email).length > MAX_EMAIL) revert BadEmail();

        profiles[msg.sender] = Profile({
            nickname: nickname,
            avatar: avatar,
            email: email,
            set: true
        });
        emit ProfileSet(msg.sender, nickname, avatar);
    }

    function profileOf(address player) external view returns (Profile memory) {
        return profiles[player];
    }

    function profilesOf(address[] calldata players) external view returns (Profile[] memory out) {
        out = new Profile[](players.length);
        for (uint256 i = 0; i < players.length; i++) {
            out[i] = profiles[players[i]];
        }
    }

    function invite(address to, uint256 tableId) external returns (uint256 index) {
        if (to == address(0) || to == msg.sender || tableId == 0) revert BadInvite();

        Invite[] storage list = inbox[to];
        uint8 openCount = 0;
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].open) {
                openCount += 1;
                if (list[i].from == msg.sender && list[i].tableId == tableId) {
                    return i;
                }
            }
        }
        if (openCount >= MAX_OPEN_INVITES) revert InboxFull();

        list.push(
            Invite({
                from: msg.sender,
                tableId: tableId,
                createdAt: uint64(block.timestamp),
                open: true
            })
        );
        index = list.length - 1;
        emit Invited(to, msg.sender, tableId, index);
    }

    function closeInvite(uint256 index) external {
        Invite[] storage list = inbox[msg.sender];
        if (index >= list.length || !list[index].open) revert BadInvite();
        list[index].open = false;
        emit InviteClosed(msg.sender, index);
    }

    function invitesOf(address player) external view returns (Invite[] memory) {
        return inbox[player];
    }

    function openInviteCount(address player) external view returns (uint256 n) {
        Invite[] storage list = inbox[player];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].open) n += 1;
        }
    }
}
