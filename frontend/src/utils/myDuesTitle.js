/**
 * The one canonical label for the /my-dues page, by role - shared so the
 * sidebar link, the top-bar title, and the page's own <h1> can never drift
 * out of sync with each other the way three separate copies of this
 * role-branch already had.
 */
export const myDuesTitle = (role) => {
  if (role === 'salesman') return 'My Customer Dues';
  if (role === 'manager') return "Team's Dues";
  return 'Customer Dues';
};
