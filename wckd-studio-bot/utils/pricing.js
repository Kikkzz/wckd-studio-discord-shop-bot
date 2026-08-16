// Pricing rules for WCKD STUDIO, straight from the price list.
// All prices in PHP (₱).

function peso(n) {
  return `₱${n.toLocaleString('en-PH')}`;
}

/**
 * @param {string} service - 'solo' | 'couple' | 'group' | 'family' | 'video'
 * @param {object} opts
 *   opts.graphicDesign {boolean}
 *   opts.tattooCount {number}   - number of characters with tattoos
 *   opts.memberCount {number}   - only used for group/family
 *   opts.xmlCount {number}      - only used for group (XML creation add-on, per character)
 */
function calculatePrice(service, opts = {}) {
  const breakdown = [];
  let total = 0;

  const tattooCount = Math.max(0, Number(opts.tattooCount) || 0);
  const xmlCount = Math.max(0, Number(opts.xmlCount) || 0);

  switch (service) {
    case 'solo': {
      total += 250;
      breakdown.push(['Solo Photo', 250]);
      if (opts.graphicDesign) {
        total += 250;
        breakdown.push(['Graphic Design', 250]);
      }
      if (tattooCount > 0) {
        const cost = tattooCount * 50;
        total += cost;
        breakdown.push([`Tattoos (${tattooCount} character${tattooCount > 1 ? 's' : ''})`, cost]);
      }
      break;
    }

    case 'couple': {
      total += 350;
      breakdown.push(['Couple Photo', 350]);
      if (opts.graphicDesign) {
        total += 250;
        breakdown.push(['Graphic Design', 250]);
      }
      if (tattooCount > 0) {
        const cost = tattooCount * 50;
        total += cost;
        breakdown.push([`Tattoos (${tattooCount} character${tattooCount > 1 ? 's' : ''})`, cost]);
      }
      break;
    }

    case 'group': {
      const memberCount = Math.max(1, Number(opts.memberCount) || 10);
      total += 1000;
      breakdown.push(['Group / Gang Photo (up to 10 members)', 1000]);

      if (memberCount > 10) {
        const extraMembers = memberCount - 10;
        const cost = extraMembers * 30;
        total += cost;
        breakdown.push([`Extra Members (${extraMembers})`, cost]);
      }

      if (tattooCount > 0) {
        const cost = tattooCount * 50;
        total += cost;
        breakdown.push([`Tattoos (${tattooCount} character${tattooCount > 1 ? 's' : ''})`, cost]);
      }

      if (opts.graphicDesign) {
        total += 500;
        breakdown.push(['Graphic Design', 500]);
      }

      if (xmlCount > 0) {
        const cost = xmlCount * 100;
        total += cost;
        breakdown.push([`XML Creation (${xmlCount} character${xmlCount > 1 ? 's' : ''})`, cost]);
      }
      break;
    }

    case 'family': {
      const memberCount = Math.min(5, Math.max(1, Number(opts.memberCount) || 5));
      total += 500;
      breakdown.push(['Family Photo (up to 5 members)', 500]);

      if (opts.graphicDesign) {
        total += 250;
        breakdown.push(['Graphic Design', 250]);
      }

      if (tattooCount > 0) {
        const cost = tattooCount * 50;
        total += cost;
        breakdown.push([`Tattoos (${tattooCount} character${tattooCount > 1 ? 's' : ''})`, cost]);
      }
      break;
    }

    case 'video': {
      // No fixed price - handled separately as a quote request.
      return { total: null, breakdown: [] };
    }

    default:
      throw new Error(`Unknown service: ${service}`);
  }

  return { total, breakdown };
}

module.exports = { calculatePrice, peso };
