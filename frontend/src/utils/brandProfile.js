/**
 * Branding for printed documents.
 *
 * The business trades under more than one name (Dhaka Blinds, Western Blinds
 * Ltd). Which logo, address and footer a document carries is decided by the
 * brand stored *on the record*, not by whoever happens to be logged in when
 * it is printed — reprinting an old Dhaka Blinds invoice from a Western
 * Blinds account has to produce the original Dhaka Blinds document.
 */

/**
 * Loads the company profile belonging to a record's brand.
 *
 * Records created before brands existed have no brand_id; omitting the
 * parameter makes the API fall back to the caller's own brand, which for
 * those legacy records is the correct historical answer since everything
 * predating this feature was Dhaka Blinds.
 */
export const fetchProfileForRecord = async (api, record) => {
  const brandId = record?.brand_id ?? record?.brand?.id ?? null;
  try {
    const res = await api.get('/company-profile', {
      params: brandId ? { brand_id: brandId } : {},
    });
    return res.data?.data || res.data || null;
  } catch {
    return null;
  }
};

/**
 * Flattens a profile into the exact strings the print layouts render, with
 * the original Dhaka Blinds wording as the last-resort fallback so a failed
 * profile fetch degrades to the pre-brand output rather than to blanks.
 */
export const brandFields = (profile) => ({
  logoSrc:
    profile?.invoice_logo_url || profile?.company_logo_url || '/logo-demo.svg',
  receiptLogoSrc:
    profile?.receipt_logo_url || profile?.company_logo_url || '/logo-demo.svg',
  name: profile?.company_name || 'Dhaka Blinds',
  footerName:
    profile?.footer_name || profile?.company_name || 'Dhaka Blinds',
  chequeFavourName:
    profile?.cheque_favour_name || profile?.company_name || 'Dhaka Blinds',
  officeAddress:
    profile?.office_address ||
    'Chowrangi Super Market, (3rd Floor), 1, Indira Road, Farmgate, Dhaka -1215',
  companyAddress: profile?.company_address || '',
  mobile: profile?.mobile || '01629000200',
  email: profile?.email || 'dhakablinds@gmail.com',
  web: profile?.company_web || 'www.dhakablinds.com',
  vatRegNo: profile?.vat_reg_no || '',
  termsConditions: profile?.terms_conditions || '',
});
