/**
 * Presentation of the two payment plan groups in one place, so the colour, the
 * label and the wording of a plan card cannot drift between the register screen,
 * the onboarding plan screen and the more-plan screen.
 *
 * The colours are existing theme tokens: primary is the app's blue and secondary
 * its orange. A group is always named in text next to its colour, because colour
 * alone is not something a buyer should have to remember in order to avoid
 * spending money on the wrong kind of plan.
 */
export const PLAN_GROUP_PRODUCT = "PRODUCT";
export const PLAN_GROUP_BOOKING = "BOOKING";

export const PLAN_GROUPS = {
    [PLAN_GROUP_PRODUCT]: {
        color: "primary",
        /** product types a plan of this group is allowed to create links for */
        productTypes: ["STANDARD"],
    },
    [PLAN_GROUP_BOOKING]: {
        color: "secondary",
        productTypes: ["YOGA_BOOKING", "BADMINTON_COURT"],
    },
};

/** Unknown, blank or legacy plans read as PRODUCT, matching the backend. */
export const normalizeGroup = (group) =>
    String(group || "").trim().toUpperCase() === PLAN_GROUP_BOOKING
        ? PLAN_GROUP_BOOKING
        : PLAN_GROUP_PRODUCT;

export const groupColor = (group) => PLAN_GROUPS[normalizeGroup(group)].color;

/** i18n key prefix shared by a group's label and hint. */
export const groupKey = (group) => `plans.group.${normalizeGroup(group)}`;

/**
 * Home route for a signed-in role, mirroring the rule the header uses so the
 * screens never disagree about where "back to home" lands.
 */
export const homeRouteFor = (role) => {
    const normalized = String(role || "").toLowerCase();
    if (normalized === "admin") return "/adminHome";
    if (normalized === "seller") return "/sellerHome";
    return "/morePlan";
};
