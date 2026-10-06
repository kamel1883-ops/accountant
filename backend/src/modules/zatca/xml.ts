function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type UblBuyer = {
  name: string;
  vat?: string;
  street?: string;
  building?: string;
  city?: string;
  postal?: string;
  district?: string;
};

export type UblDoc = {
  id: string;
  uuid: string;
  issueDate: string;
  issueTime: string;
  typeCode: '388' | '381' | '383';
  ksaCode: string;
  currency: string;
  icv: number;
  pih: string;
  seller: {
    name: string;
    vat: string;
    crn?: string;
    street: string;
    building: string;
    city: string;
    postal: string;
    district: string;
  };
  buyer?: UblBuyer;
  lines: { name: string; qty: number; price: number; lineNet: number; vat: number; lineGross: number }[];
  subtotal: number;
  vat: number;
  total: number;
  billingRef?: string;
  instructionNote?: string;
};

function taxSchemeVat() {
  return `<cac:TaxScheme>
                <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID>
            </cac:TaxScheme>`;
}

function taxCatS(percent: string) {
  return `<cac:TaxCategory>
                 <cbc:ID schemeID="UN/ECE 5305" schemeAgencyID="6">S</cbc:ID>
                 <cbc:Percent>${percent}</cbc:Percent>
                ${taxSchemeVat()}
             </cac:TaxCategory>`;
}

/** Unsigned UBL matching ZATCA SDK samples (no QR, no XAdES). fatooraNet sign fills those. */
export function buildUnsignedUblInvoice(doc: UblDoc) {
  const isSimplified = doc.ksaCode.startsWith('02');
  const crn = doc.seller.crn && doc.seller.crn !== doc.seller.vat ? doc.seller.crn : '1010010000';
  const building = String(doc.seller.building || '1234').replace(/\D/g, '').slice(0, 4).padStart(4, '1');
  const postal = String(doc.seller.postal || '12345').replace(/\D/g, '').slice(0, 5).padStart(5, '1');

  const lines = doc.lines.map((l, i) => `
    <cac:InvoiceLine>
        <cbc:ID>${i + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="PCE">${l.qty.toFixed(6)}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${doc.currency}">${l.lineNet.toFixed(2)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
             <cbc:TaxAmount currencyID="${doc.currency}">${l.vat.toFixed(2)}</cbc:TaxAmount>
             <cbc:RoundingAmount currencyID="${doc.currency}">${l.lineGross.toFixed(2)}</cbc:RoundingAmount>
        </cac:TaxTotal>
        <cac:Item>
            <cbc:Name>${esc(l.name)}</cbc:Name>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>S</cbc:ID>
                <cbc:Percent>15.00</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:ClassifiedTaxCategory>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="${doc.currency}">${l.price.toFixed(2)}</cbc:PriceAmount>
        </cac:Price>
    </cac:InvoiceLine>`).join('');

  const buyer = isSimplified
    ? `
     <cac:AccountingCustomerParty>
    </cac:AccountingCustomerParty>`
    : `
     <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PostalAddress>
                <cbc:StreetName>${esc(doc.buyer?.street || 'Salah Al-Din')}</cbc:StreetName>
                <cbc:BuildingNumber>${esc(doc.buyer?.building || '1111')}</cbc:BuildingNumber>
                <cbc:CitySubdivisionName>${esc(doc.buyer?.district || 'Al-Murooj')}</cbc:CitySubdivisionName>
                <cbc:CityName>${esc(doc.buyer?.city || 'Riyadh')}</cbc:CityName>
                <cbc:PostalZone>${esc(doc.buyer?.postal || '12222')}</cbc:PostalZone>
                <cac:Country>
                    <cbc:IdentificationCode>SA</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${esc(doc.buyer?.vat || '399999999800003')}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${esc(doc.buyer?.name || 'Buyer')}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingCustomerParty>`;

  const billing = doc.billingRef ? `
    <cac:BillingReference>
        <cac:InvoiceDocumentReference>
            <cbc:ID>${esc(doc.billingRef)}</cbc:ID>
        </cac:InvoiceDocumentReference>
    </cac:BillingReference>` : '';

  const delivery = (!isSimplified || doc.typeCode !== '388') ? `
    <cac:Delivery>
        <cbc:ActualDeliveryDate>${esc(doc.issueDate)}</cbc:ActualDeliveryDate>
    </cac:Delivery>` : '';

  const instruction = doc.typeCode !== '388'
    ? `
        <cbc:InstructionNote>${esc(doc.instructionNote || 'Cancellation')}</cbc:InstructionNote>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
    <cbc:ID>${esc(doc.id)}</cbc:ID>
    <cbc:UUID>${esc(doc.uuid)}</cbc:UUID>
    <cbc:IssueDate>${esc(doc.issueDate)}</cbc:IssueDate>
    <cbc:IssueTime>${esc(doc.issueTime)}</cbc:IssueTime>
    <cbc:InvoiceTypeCode name="${esc(doc.ksaCode)}">${doc.typeCode}</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>${doc.currency}</cbc:DocumentCurrencyCode>
    <cbc:TaxCurrencyCode>${doc.currency}</cbc:TaxCurrencyCode>
    ${billing}
    <cac:AdditionalDocumentReference>
        <cbc:ID>ICV</cbc:ID>
        <cbc:UUID>${doc.icv}</cbc:UUID>
    </cac:AdditionalDocumentReference>
    <cac:AdditionalDocumentReference>
        <cbc:ID>PIH</cbc:ID>
        <cac:Attachment>
            <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(doc.pih)}</cbc:EmbeddedDocumentBinaryObject>
        </cac:Attachment>
    </cac:AdditionalDocumentReference>
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="CRN">${esc(crn)}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PostalAddress>
                <cbc:StreetName>${esc(doc.seller.street)}</cbc:StreetName>
                <cbc:BuildingNumber>${esc(building)}</cbc:BuildingNumber>
                <cbc:CitySubdivisionName>${esc(doc.seller.district)}</cbc:CitySubdivisionName>
                <cbc:CityName>${esc(doc.seller.city)}</cbc:CityName>
                <cbc:PostalZone>${esc(postal)}</cbc:PostalZone>
                <cac:Country>
                    <cbc:IdentificationCode>SA</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${esc(doc.seller.vat)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName>${esc(doc.seller.name)}</cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingSupplierParty>
    ${buyer}
    ${delivery}
    <cac:PaymentMeans>
        <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>${instruction}
    </cac:PaymentMeans>
    <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason>
        <cbc:Amount currencyID="${doc.currency}">0.00</cbc:Amount>
        ${taxCatS('15')}
    </cac:AllowanceCharge>
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${doc.currency}">${doc.vat.toFixed(2)}</cbc:TaxAmount>
    </cac:TaxTotal>
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${doc.currency}">${doc.vat.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${doc.currency}">${doc.subtotal.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${doc.currency}">${doc.vat.toFixed(2)}</cbc:TaxAmount>
             ${taxCatS('15.00')}
        </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${doc.currency}">${doc.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="${doc.currency}">${doc.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="${doc.currency}">${doc.total.toFixed(2)}</cbc:TaxInclusiveAmount>
        <cbc:AllowanceTotalAmount currencyID="${doc.currency}">0.00</cbc:AllowanceTotalAmount>
        <cbc:PrepaidAmount currencyID="${doc.currency}">0.00</cbc:PrepaidAmount>
        <cbc:PayableAmount currencyID="${doc.currency}">${doc.total.toFixed(2)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
    ${lines}
</Invoice>`;
}

export const buildUblInvoice = buildUnsignedUblInvoice;
