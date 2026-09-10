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
export const brandFields = (profile) => {
  const isWestern =
    profile?.id === 2 ||
    profile?.brand_id === 2 ||
    (profile?.company_name && /western/i.test(profile.company_name)) ||
    (profile?.office_address && /badda/i.test(profile.office_address)) ||
    (profile?.office_address && /house:\s*300/i.test(profile.office_address));

  return {
    logoSrc:
      profile?.invoice_logo_url || profile?.company_logo_url || '/logo-demo.svg',
    receiptLogoSrc:
      profile?.receipt_logo_url || profile?.company_logo_url || '/logo-demo.svg',
    name: profile?.company_name || (isWestern ? 'Western Blinds Ltd' : 'Dhaka Blinds'),
    footerName:
      profile?.footer_name || profile?.company_name || (isWestern ? 'Western Blinds Ltd' : 'Dhaka Blinds'),
    chequeFavourName:
      profile?.cheque_favour_name || profile?.company_name || (isWestern ? 'Western Blinds Ltd' : 'Dhaka Blinds'),
    officeAddress:
      profile?.office_address ||
      (isWestern
        ? 'House: 300, (1st Floor), Road: Shadhinata Shoroni, Uttar Badda, Dhaka -1212'
        : 'Chowrangi Super Market, (3rd Floor), 1, Indira Road, Farmgate, Dhaka -1215'),
    companyAddress:
      profile?.company_address ||
      (isWestern
        ? 'House: 300, (1st Floor), Road: Shadhinata Shoroni, Uttar Badda, Dhaka-1212'
        : ''),
    mobile: profile?.mobile || (isWestern ? '01718040323' : '01629000200'),
    email: profile?.email || (isWestern ? 'westernblindltd@gmail.com' : 'dhakablinds@gmail.com'),
    web: profile?.company_web || profile?.website || profile?.web || (isWestern ? 'www.westernblindsltd.com' : 'www.dhakablinds.com'),
    vatRegNo: profile?.vat_reg_no || (isWestern ? '004557266-0110' : ''),
    termsConditions: profile?.terms_conditions || '',
  };
};
