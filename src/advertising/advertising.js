/*
------------------------------------------------------------------------------
advertising.js

Purpose

    Central advertisement controller.

Responsibilities

    • Determine whether an advertisement may be shown.
    • Enforce cooldowns.
    • Enforce enable / disable flags.
    • Trigger advertisement providers.

This module intentionally knows nothing about readers, pages,
chapters, or navigation.

The website simply reports opportunities.

Example

    Advertising.opportunity("chapter");

    Advertising.opportunity("next");

    Advertising.opportunity("previous");

    Advertising.opportunity("landing");

------------------------------------------------------------------------------
*/

import advertisingConfig from "../data/advertising.json";

const state = {

    lastAdvertisement: 0

};

const Advertising = {

    enabled() {
        return advertisingConfig.enabled;
    },

    cooldown() {
        return advertisingConfig.cooldown_seconds * 1000;
    },

    ready() {

        const elapsed = Date.now() - state.lastAdvertisement;

        return elapsed >= this.cooldown();

    },

    trigger() {

        if (!this.enabled())
            return false;

        if (!this.ready())
            return false;

        state.lastAdvertisement = Date.now();

        window.open(
            advertisingConfig.popunder.url,
            "_blank",
            "noopener,noreferrer"
        );

        return true;

    },

    opportunity(type = "generic") {

        // Future:
        // chapter
        // previous
        // next
        // landing
        // search
        // archive

        return this.trigger();

    }

};

export default Advertising;
