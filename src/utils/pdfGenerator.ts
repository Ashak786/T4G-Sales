import { jsPDF } from 'jspdf';
import { Sale } from '../supabase';

// Helper function to convert numeric Rupees to Indian currency words
function numberToRupeesWords(amount: number): string {
  const sglDigit = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const dblDigit = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tensPlace = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const handle_group = (n: number) => {
    let str = "";
    if (n >= 100) {
      str += sglDigit[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 10 && n < 20) {
      str += dblDigit[n - 10] + " ";
    } else if (n >= 20) {
      str += tensPlace[Math.floor(n / 10)] + " ";
      if (n % 10 > 0) {
        str += sglDigit[n % 10] + " ";
      }
    } else if (n > 0) {
      str += sglDigit[n] + " ";
    }
    return str;
  };
  
  if (amount === 0) return "Rupees Zero Only";
  
  let num = Math.floor(amount);
  let words = "";
  
  // Crores
  if (num >= 10000000) {
    words += handle_group(Math.floor(num / 10000000)) + " Crore ";
    num %= 10000000;
  }
  // Lakhs
  if (num >= 100000) {
    words += handle_group(Math.floor(num / 100000)) + " Lakh ";
    num %= 100000;
  }
  // Thousands
  if (num >= 1000) {
    words += handle_group(Math.floor(num / 1000)) + " Thousand ";
    num %= 1000;
  }
  // Hundreds & tens
  if (num > 0) {
    words += handle_group(num);
  }
  
  return "Rupees " + words.trim().replace(/\s+/g, ' ') + " Only";
}

// Format amount to standard Indian Rupees format (without special Unicode characters like ₹ which Helvetica doesn't support)
function formatRupees(amount: number): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `Rs. ${formatter.format(amount)}`;
}

// Fetch QR Code image as base64 to embed offline-friendly in the PDF
async function fetchQRCodeBase64(upiString: string): Promise<string | null> {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}&color=15-23-42`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to generate QR code dynamically:", error);
    return null;
  }
}

export async function generateInvoicePDF(sale: Sale, salesList: Sale[] = []): Promise<void> {
  // Create instance of jsPDF (A4 page: 210mm x 297mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Calculate chronological sequential Invoice ID starting at INV-008
  const sortedSales = [...salesList].sort((a, b) => {
    const dateA = new Date(a.created_at || a.sale_date).getTime();
    const dateB = new Date(b.created_at || b.sale_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.id.localeCompare(b.id);
  });

  const saleIndex = sortedSales.findIndex(s => s.id === sale.id);
  const sequenceNumber = saleIndex !== -1 ? 8 + saleIndex : 8;
  const invoiceNo = `INV-${String(sequenceNumber).padStart(3, '0')}`;

  // Color Palette Definitions (Match the beautiful Navy banner from template)
  const navyColor = [18, 34, 64]; // Custom Deep Navy
  const borderGrey = [180, 180, 180];
  const lightGrayBg = [248, 250, 252];

  // Dynamic UPI payment string for real transactions
  const upiUrl = `upi://pay?pa=ajaykumar6405-4@okicici&pn=TECH4GEEKY&am=${sale.amount}&cu=INR&tn=Invoice%20${invoiceNo}`;
  const qrBase64 = await fetchQRCodeBase64(upiUrl);

  // --- 1. BRANDING HEADER BANNER ---
  // Solid Navy blue header rectangle
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, 15, 180, 32, 'F');

  // White Box container for TECH 4 GEEKY Logo
  doc.setFillColor(255, 255, 255);
  doc.rect(25, 20, 72, 14, 'F');

  // Draw "TECH"
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('TECH', 29, 29.5);

  // Black accent square behind "4"
  doc.setFillColor(0, 0, 0);
  doc.rect(49, 21.5, 9, 11, 'F');
  
  // White "4" inside the black square
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('4', 53.5, 29.5, { align: 'center' });

  // Draw "GEEKY"
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('GEEKY', 61, 29.5);

  // Slogan text below logo (Centered inside the Navy banner)
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('"NERD ABOUT TECH"', 61, 41, { align: 'center' });

  // Email ID text in header on the right
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Email ID: tgeeky96@gmail.com', 190, 29, { align: 'right' });


  // --- 2. TAX INVOICE TITLE ---
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TAX INVOICE', 105, 54, { align: 'center' });


  // --- 3. TO & INVOICE DETAILS GRID ---
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.3);

  // Left Column ("To,")
  doc.rect(15, 59, 115, 15);
  doc.setFontSize(10);
  doc.setFont('Helvetica', 'bold');
  doc.text('To,', 18, 64);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(sale.client_name || 'N/A', 18, 70);

  // Right Column (Metadata: Invoice No & Date)
  doc.rect(130, 59, 65, 15);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Invoice No:', 133, 64);
  doc.setFont('Helvetica', 'bold');
  doc.text(invoiceNo, 155, 64);

  doc.setFont('Helvetica', 'normal');
  doc.text('Date:', 133, 70);
  doc.setFont('Helvetica', 'bold');
  doc.text(sale.sale_date, 155, 70);


  // --- 4. SERVICES TABLE ---
  const startX = 15;
  const endX = 195;
  const colX = [15, 30, 55, 160, 195];
  const tableY = 78;

  // Header Row Box
  doc.rect(startX, tableY, endX - startX, 10);
  // Column dividers for headers
  colX.slice(1, -1).forEach(x => {
    doc.line(x, tableY, x, tableY + 10);
  });

  doc.setFontSize(9.5);
  doc.setFont('Helvetica', 'bold');
  doc.text('SL.', 22.5, tableY + 4, { align: 'center' });
  doc.text('No', 22.5, tableY + 8, { align: 'center' });
  doc.text('Date', 42.5, tableY + 6, { align: 'center' });
  doc.text('Description', 107.5, tableY + 6, { align: 'center' });
  doc.text('Amount', 177.5, tableY + 6, { align: 'center' });

  // Row 1 - Dynamically height-adjusted content row
  const row1Y = tableY + 10;
  doc.setFont('Helvetica', 'normal');
  
  const serviceText = `${sale.category} Service Statement`;
  const splitDetails = doc.splitTextToSize(sale.description ? `${serviceText}\n${sale.description}` : serviceText, 100);
  const textLinesCount = splitDetails.length;
  // Calculate height dynamically: 5mm per line plus 4mm padding
  const rowHeight = Math.max(12, textLinesCount * 5 + 4);

  // Draw Content Row Box
  doc.rect(startX, row1Y, endX - startX, rowHeight);
  // Draw vertical dividers for the content row
  colX.slice(1, -1).forEach(x => {
    doc.line(x, row1Y, x, row1Y + rowHeight);
  });

  // Render row cell values
  doc.text('1', 22.5, row1Y + (rowHeight / 2) + 1, { align: 'center' });
  doc.text(sale.sale_date, 42.5, row1Y + (rowHeight / 2) + 1, { align: 'center' });
  
  doc.setFont('Helvetica', 'bold');
  doc.text(splitDetails, 58, row1Y + 5);

  const formattedAmount = formatRupees(sale.amount);
  doc.text(formattedAmount, 177.5, row1Y + (rowHeight / 2) + 1, { align: 'center' });


  // --- 5. SUMMARY CELLS (ROUND OFF & TOTAL) ---
  const roundOffY = row1Y + rowHeight;
  doc.rect(startX, roundOffY, endX - startX, 8);
  doc.line(160, roundOffY, 160, roundOffY + 8);
  doc.setFont('Helvetica', 'normal');
  doc.text('(-) Round off', 155, roundOffY + 5.5, { align: 'right' });
  doc.text('-', 177.5, roundOffY + 5.5, { align: 'center' });

  const totalPayableY = roundOffY + 8;
  doc.rect(startX, totalPayableY, endX - startX, 8);
  doc.line(160, totalPayableY, 160, totalPayableY + 8);
  doc.setFont('Helvetica', 'bold');
  doc.text('Total Payable', 155, totalPayableY + 5.5, { align: 'right' });
  doc.text(formattedAmount, 177.5, totalPayableY + 5.5, { align: 'center' });


  // --- 6. RUPEES & NOTE BOXES ---
  const rupeesY = totalPayableY + 8;
  doc.rect(startX, rupeesY, endX - startX, 8);
  doc.setFont('Helvetica', 'bold');
  doc.text(`Rupees`, 18, rupeesY + 5.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(`:  ${numberToRupeesWords(sale.amount)}`, 32, rupeesY + 5.5);

  const noteY = rupeesY + 8;
  doc.rect(startX, noteY, endX - startX, 8);
  doc.setFont('Helvetica', 'bold');
  doc.text(`Note`, 18, noteY + 5.5);
  doc.setFont('Helvetica', 'normal');
  doc.text(`:  Due Date: 5 days from the date of this invoice.`, 32, noteY + 5.5);


  // --- 7. PAYMENT DETAILS & DYNAMIC UPI QR CODE BANNER ---
  const paymentBlockY = noteY + 12;
  // Outer Box
  doc.rect(15, paymentBlockY, 180, 52);

  // Left Section: Bank Account and Transfer details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Payment Details:', 20, paymentBlockY + 7);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Kindly complete the payment via Bank Details Provided:', 52, paymentBlockY + 7);

  // Bullet items for Bank Account Details
  const detailsOffset = paymentBlockY + 14;
  doc.setFont('Helvetica', 'bold');
  doc.text('Account No:', 20, detailsOffset);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('44089862533', 52, detailsOffset);

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.text('IFSC Code:', 20, detailsOffset + 6);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('SBIN0017060', 52, detailsOffset + 6);

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.text('UPI ID:', 20, detailsOffset + 12);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('ajaykumar6405-4@okicici', 52, detailsOffset + 12);

  doc.setTextColor(120, 120, 120);
  doc.setFont('Helvetica', 'italic');
  doc.text('Due Date: 5 days from the date of this invoice.', 20, detailsOffset + 19);

  // Right Section: Scan & Pay QR Code Box
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.line(135, paymentBlockY, 135, paymentBlockY + 52); // Splitter line

  if (qrBase64) {
    // Render working QR Code dynamically fetched from standard QR API
    doc.addImage(qrBase64, 'PNG', 145, paymentBlockY + 4, 38, 38);
    doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Scan & Pay via UPI', 164, paymentBlockY + 47, { align: 'center' });
  } else {
    // If offline/API fails, show a beautiful visual QR code placeholder
    doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
    doc.rect(145, paymentBlockY + 4, 38, 38, 'F');
    doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
    doc.rect(145, paymentBlockY + 4, 38, 38, 'S');
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont('Helvetica', 'normal');
    doc.text('[UPI QR Code]', 164, paymentBlockY + 20, { align: 'center' });
    doc.text('ajaykumar6405-4@okicici', 164, paymentBlockY + 25, { align: 'center' });
    doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
    doc.setFont('Helvetica', 'bold');
    doc.text('Scan & Pay via UPI', 164, paymentBlockY + 47, { align: 'center' });
  }


  // --- 8. FOOTER METADATA ---
  const footerY = 250;
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.line(15, footerY, 195, footerY);

  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Terms & Conditions', 15, footerY + 6);

  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(7.5);
  doc.text('1. This is a computer-generated transaction invoice representing registered services from Tech4Geeky.', 15, footerY + 11);
  doc.text('2. Payments should be completed within the 5 days due period to avoid compliance reviews.', 15, footerY + 15);
  doc.text('3. For support or dispute queries, kindly address tgeeky96@gmail.com.', 15, footerY + 19);

  // Authorized signature section
  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('AUTHORIZED SIGNATORY', 195, footerY + 6, { align: 'right' });
  doc.setFont('Helvetica', 'italic');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('Tech4Geeky Systems Representative', 195, footerY + 12, { align: 'right' });


  // Save the document
  const fileName = `Invoice_${invoiceNo}_${sale.client_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(fileName);
}
