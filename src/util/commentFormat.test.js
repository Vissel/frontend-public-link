import { buildCommentTree, formatCommentDateTime } from "./commentFormat";

describe("buildCommentTree", () => {
  it("nests a reply under its parent and roots orphans at the top", () => {
    const flat = [
      { uuid: "a", parentUuid: "root" },
      { uuid: "b", parentUuid: "a" },
      { uuid: "c", parentUuid: "root" },
    ];
    const tree = buildCommentTree(flat);

    // "root" is the thread root and not in the list, so a and c are top-level.
    expect(tree.map((n) => n.comment.uuid)).toEqual(["a", "c"]);
    expect(tree[0].children.map((n) => n.comment.uuid)).toEqual(["b"]);
    expect(tree[1].children).toHaveLength(0);
  });

  it("keeps a reply whose parent is missing from the page at the top level", () => {
    const tree = buildCommentTree([{ uuid: "x", parentUuid: "not-loaded" }]);
    expect(tree.map((n) => n.comment.uuid)).toEqual(["x"]);
  });

  it("never self-parents a comment", () => {
    const tree = buildCommentTree([{ uuid: "y", parentUuid: "y" }]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(0);
  });
});

describe("formatCommentDateTime", () => {
  it("renders a day-first date-time", () => {
    // 2026-01-05T09:07:00Z in UTC; assert only the date part order is day-first
    // so the check is timezone-independent.
    const out = formatCommentDateTime("2026-01-05T09:07:00Z");
    expect(out).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
  });

  it("returns an empty string for a missing stamp", () => {
    expect(formatCommentDateTime(null)).toBe("");
    expect(formatCommentDateTime("not-a-date")).toBe("");
  });
});
