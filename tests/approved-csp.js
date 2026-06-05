// approved-csp.js — THE approved Content Security Policy string
// (STANDARDS §9/§17: single source of truth; changes require Security
// Engineer authorship and Engineering Lead sign-off). smoke.spec.js and
// xss.spec.js both verify the built HTML against this exact string.

module.exports.APPROVED_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; worker-src blob:; object-src 'none'; " +
  "base-uri 'none'; form-action 'none';";
