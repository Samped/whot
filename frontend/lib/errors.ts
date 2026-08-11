function flattenError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else if (typeof cur === "string") {
      parts.push(cur);
      break;
    } else {
      break;
    }
  }
  return parts.join(" · ");
}

export function friendlyError(err: unknown): string {
  const raw = flattenError(err) || "Something went wrong";

  const named = raw.match(
    /WrongPhase|NotSeated|NotYourTurn|TableFull|InsufficientFee|BadAttestation|HandleMismatch|IllegalCard|NeedShape|HandFull|EmptyMarket|BadIndex|AlreadySeated|VaultBusy|InvalidStake|InvalidBombs|InsufficientHouse|VaultInactive|AlreadyOpened|NeedAPick|HitACurse|MaxDepth|User rejected|user rejected/i,
  );
  if (named) {
    const key = named[0].toLowerCase();
    if (key.includes("rejected")) return "Wallet rejected the transaction.";
    if (key === "vaultbusy") return "You already have an open vault — resuming it.";
    if (key === "insufficienthouse") return "House bankroll cannot cover this stake.";
    if (key === "insufficientfee") return "Not enough ETH sent for the Inco shuffle fee.";
    if (key === "notyourturn") return "Not your turn.";
    if (key === "illegalcard") return "That card cannot follow the pile.";
    if (key === "needshape") return "WHOT needs a shape call.";
    if (key === "alreadysseated" || key === "alreadyseated") return "You are already at this table.";
    if (key === "emptymarket") return "Market is empty.";
    if (key === "wrongphase") return "Table is not ready for that move.";
    if (key === "notable") return "That table does not exist.";
    if (key === "nothost") return "Only the host can cancel this table.";
    if (key === "invalidstake") return "Stake must be between 0.0001 and 0.05 ETH.";
    if (key === "vaultinactive") return "No open vault. Enter again.";
    return named[0];
  }

  if (/gas limit too high/i.test(raw)) {
    return "That move asked for too much gas. Tap again.";
  }

  if (/internal error was received|internal rpc|rpc payload|-32603/i.test(raw)) {
    return "The network dropped that move. Tap again.";
  }

  if (/nonce|already known|replacement/i.test(raw)) {
    return "A move is already in flight. Wait a few seconds, then tap again.";
  }

  if (/failed to decrypt|attesteddecrypt|not (yet )?ready|unknown handle/i.test(raw)) {
    return "Sealed hand is not ready yet — wait a moment, then tap peek.";
  }

  if (/out of gas|ran out of gas/i.test(raw)) {
    return "Computer needed more room to pick. Tap nudge once.";
  }

  if (/computer pick reverted|computer dump reverted/i.test(raw)) {
    return "Computer could not dump that card. Tap nudge once.";
  }

  if (/revert|reverted|execution/i.test(raw)) {
    return "That move did not land. Tap again.";
  }

  return raw.split("\n")[0]?.slice(0, 160) || "Transaction failed";
}
