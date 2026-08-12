export const socialAbi = [
  {
    type: "function",
    name: "setProfile",
    inputs: [
      { name: "nickname", type: "string" },
      { name: "avatar", type: "uint8" },
      { name: "email", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "profileOf",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "nickname", type: "string" },
          { name: "avatar", type: "uint8" },
          { name: "email", type: "string" },
          { name: "set", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "profilesOf",
    inputs: [{ name: "players", type: "address[]" }],
    outputs: [
      {
        name: "out",
        type: "tuple[]",
        components: [
          { name: "nickname", type: "string" },
          { name: "avatar", type: "uint8" },
          { name: "email", type: "string" },
          { name: "set", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "invite",
    inputs: [
      { name: "to", type: "address" },
      { name: "tableId", type: "uint256" },
    ],
    outputs: [{ name: "index", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeInvite",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "invitesOf",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "from", type: "address" },
          { name: "tableId", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "open", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "openInviteCount",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "n", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Invited",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "tableId", type: "uint256", indexed: true },
      { name: "inviteIndex", type: "uint256", indexed: false },
    ],
  },
] as const;
