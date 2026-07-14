import { jsPDF } from 'jspdf';
import { Sale } from './serverDb';

// Helper to convert numeric Rupees to Indian currency words
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

function formatRupees(amount: number): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `Rs. ${formatter.format(amount)}`;
}

export function formatIndianDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.split(/[ T]/)[0].trim();
  
  let parts = cleanDate.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  parts = cleanDate.split('/');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  return cleanDate;
}

// Draw the beautiful TECH 4 GEEKY Logo directly using standard jsPDF shapes and text
function drawBrandingLogo(doc: jsPDF, x: number, y: number) {
  // Left half: Black rectangle block
  doc.setFillColor(0, 0, 0);
  doc.rect(x, y, 32, 14, 'F');

  // Right half: White rectangle block with thin black border
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(x + 32, y, 34, 14, 'FD');

  // Draw white "TECH" text
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TECH', x + 16, y + 8, { align: 'center' });

  // Draw black "GEEKY" text
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GEEKY', x + 49, y + 8, { align: 'center' });

  // Draw stylized central "4"
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(26);
  doc.text('4', x + 32, y + 10.5, { align: 'center' });
}

export function generateServerInvoicePDF(sale: Sale, salesList: Sale[] = []): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Calculate chronological sequential Invoice ID starting at INV-001
  const sortedSales = [...salesList].sort((a, b) => {
    const dateA = new Date(a.created_at || a.sale_date).getTime();
    const dateB = new Date(b.created_at || b.sale_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return a.id.localeCompare(b.id);
  });

  const saleIndex = sortedSales.findIndex(s => s.id === sale.id);
  const sequenceNumber = saleIndex !== -1 ? 1 + saleIndex : 1;
  const invoiceNo = sale.invoice_no || `INV-${String(sequenceNumber).padStart(3, '0')}`;

  const navyColor = [18, 34, 64]; 
  const borderGrey = [180, 180, 180];
  const lightGrayBg = [248, 250, 252];

  // Dynamic UPI payment string for real transactions
  const upiUrl = `upi://pay?pa=ajaykumar6405-4@okicici&pn=TECH4GEEKY&am=${sale.amount}&cu=INR&tn=Invoice%20${invoiceNo}`;

  // --- 1. BRANDING HEADER BANNER ---
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, 15, 180, 32, 'F');

  // Draw high fidelity logo using native shapes & text (so no canvas needed on server)
  drawBrandingLogo(doc, 25, 18);

  // Slogan text below logo
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('"NERD ABOUT TECH"', 59, 41.5, { align: 'center' });

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
  doc.text(formatIndianDate(sale.sale_date), 155, 70);


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
  
  const serviceText = sale.description ? sale.description.trim() : sale.category;
  const splitDetails = doc.splitTextToSize(serviceText, 100);
  const textLinesCount = splitDetails.length;
  const rowHeight = Math.max(12, textLinesCount * 5 + 4);

  // Draw Content Row Box
  doc.rect(startX, row1Y, endX - startX, rowHeight);
  colX.slice(1, -1).forEach(x => {
    doc.line(x, row1Y, x, row1Y + rowHeight);
  });

  // Render row cell values
  doc.text('1', 22.5, row1Y + (rowHeight / 2) + 1, { align: 'center' });
  doc.text(formatIndianDate(sale.sale_date), 42.5, row1Y + (rowHeight / 2) + 1, { align: 'center' });
  
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
  doc.rect(15, paymentBlockY, 180, 52);

  // Left Section
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Payment Details:', 20, paymentBlockY + 6);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text('Kindly complete the payment via Bank Details Provided:', 20, paymentBlockY + 11);

  const detailsOffset = paymentBlockY + 18;
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.text('Account No:', 20, detailsOffset);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('44089862533', 48, detailsOffset);

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.text('IFSC Code:', 20, detailsOffset + 6);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('SBIN0017060', 48, detailsOffset + 6);

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.text('UPI ID:', 20, detailsOffset + 12);
  doc.setTextColor(0, 102, 204); 
  doc.text('ajaykumar6405-4@okicici', 48, detailsOffset + 12);
  
  const upiWidthInDetails = doc.getTextWidth('ajaykumar6405-4@okicici');
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.2);
  doc.line(48, detailsOffset + 12 + 0.4, 48 + upiWidthInDetails, detailsOffset + 12 + 0.4);
  doc.link(48, detailsOffset + 12 - 3.5, upiWidthInDetails, 4.5, { url: upiUrl });

  doc.setTextColor(120, 120, 120);
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text('Due Date: 5 days from the date of this invoice.', 20, detailsOffset + 19);

  // Right Section: Scan & Pay QR Code Box
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.line(135, paymentBlockY, 135, paymentBlockY + 52); 

  const qrSize = 42;
  const qrX = 135 + (60 - qrSize) / 2;
  const qrY = paymentBlockY + (52 - qrSize) / 2;

  // Render a beautiful visual QR code placeholder that is fully clickable
  doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
  doc.rect(qrX, qrY, qrSize, qrSize, 'F');
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.rect(qrX, qrY, qrSize, qrSize, 'S');
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'normal');
  doc.text('[UPI QR Code]', qrX + qrSize / 2, qrY + qrSize / 2 - 2, { align: 'center' });
  doc.setFontSize(7.5);
  doc.text('ajaykumar6405-4@okicici', qrX + qrSize / 2, qrY + qrSize / 2 + 4, { align: 'center' });
  doc.link(qrX, qrY, qrSize, qrSize, { url: upiUrl });

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

  return Buffer.from(doc.output('arraybuffer'));
}

export function generateServerMonthlySummaryPDF(sales: Sale[], targetMonthYMD?: string): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const navyColor = [18, 34, 64];
  const borderGrey = [180, 180, 180];
  const lightGrayBg = [248, 250, 252];

  // Calculate target month dynamically
  const now = new Date();
  let prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
  if (targetMonthYMD && targetMonthYMD.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = targetMonthYMD.split('-').map(Number);
    prevMonthDate = new Date(year, month - 1, 1);
  }

  const prevMonthName = prevMonthDate.toLocaleString('en-US', { month: 'long' });
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthLabel = `${prevMonthName} ${prevYear}`;
  const prevMonthYMD = `${prevYear}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Filter sales for target month
  const prevMonthSales = sales.filter(s => {
    if (!s.sale_date) return false;
    return s.sale_date.startsWith(prevMonthYMD);
  });

  // Sort sales chronologically
  prevMonthSales.sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());

  // Compute metrics
  const totalRevenue = prevMonthSales.reduce((sum, s) => sum + s.amount, 0);
  const totalCount = prevMonthSales.length;
  const averageValue = totalCount > 0 ? totalRevenue / totalCount : 0;

  // Category breakdown
  const categories = [
    'Video editing',
    'Web Site development',
    'Govt. Service (Appl.)',
    'PC Repair',
    'Graphic Designing'
  ];
  
  const categoryStats = categories.map(cat => {
    const catSales = prevMonthSales.filter(s => s.category === cat);
    const rev = catSales.reduce((sum, s) => sum + s.amount, 0);
    return {
      name: cat,
      count: catSales.length,
      revenue: rev,
      pct: totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0
    };
  });

  // --- 1. BRANDING HEADER BANNER ---
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, 15, 180, 32, 'F');

  // Draw dynamic vector logo
  drawBrandingLogo(doc, 25, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('"NERD ABOUT TECH"', 59, 41.5, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Email ID: tgeeky96@gmail.com', 190, 29, { align: 'right' });

  // --- 2. REPORT TITLE ---
  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MONTHLY SALES PERFORMANCE REPORT', 105, 55, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Reporting Period: ${prevMonthLabel.toUpperCase()}`, 105, 61, { align: 'center' });
  doc.text(`Generated On: ${formatIndianDate(now.toISOString().split('T')[0])}`, 105, 66, { align: 'center' });

  // --- 3. METRIC SUMMARY CARDS ---
  let y = 73;
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.35);
  doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
  doc.rect(15, y, 180, 24, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('TOTAL REVENUE', 20, y + 7);
  doc.setFontSize(13);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text(formatRupees(totalRevenue), 20, y + 16);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('TOTAL INVOICES', 85, y + 7);
  doc.setFontSize(13);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text(`${totalCount} Sales`, 85, y + 16);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('AVG ORDER VALUE', 145, y + 7);
  doc.setFontSize(13);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text(formatRupees(averageValue), 145, y + 16);

  // --- 4. CATEGORY BREAKDOWN TABLE ---
  y += 33;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('I. SERVICE CATEGORY BREAKDOWN', 15, y);

  y += 4;
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, y, 180, 7.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Category Name', 18, y + 5);
  doc.text('Sales Count', 100, y + 5, { align: 'right' });
  doc.text('Total Revenue', 145, y + 5, { align: 'right' });
  doc.text('Contribution %', 190, y + 5, { align: 'right' });

  y += 7.5;
  categoryStats.forEach((cat, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(250, 250, 250);
    } else {
      doc.setFillColor(240, 243, 248);
    }
    doc.rect(15, y, 180, 7.5, 'F');
    doc.setDrawColor(220, 225, 230);
    doc.line(15, y + 7.5, 195, y + 7.5);

    doc.setTextColor(40, 40, 40);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(cat.name, 18, y + 5);
    doc.text(String(cat.count), 100, y + 5, { align: 'right' });
    doc.text(formatRupees(cat.revenue), 145, y + 5, { align: 'right' });
    doc.text(`${cat.pct.toFixed(1)}%`, 190, y + 5, { align: 'right' });

    y += 7.5;
  });

  // --- 5. DETAILED INVOICE LOGS ---
  y += 8;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('II. ITEMIZED SALES LOG', 15, y);

  y += 4;
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, y, 180, 7.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Date', 18, y + 5);
  doc.text('Client Name', 43, y + 5);
  doc.text('Category', 105, y + 5);
  doc.text('Method', 153, y + 5);
  doc.text('Amount', 190, y + 5, { align: 'right' });

  y += 7.5;

  if (prevMonthSales.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(15, y, 180, 10, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No transaction records found for this period.', 105, y + 6.5, { align: 'center' });
    y += 10;
  } else {
    prevMonthSales.forEach((s, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
        doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
        doc.line(15, y, 195, y);
        y += 5;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(15, y, 180, 7.5, 'F');
      doc.setDrawColor(235, 238, 242);
      doc.line(15, y + 7.5, 195, y + 7.5);

      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(formatIndianDate(s.sale_date), 18, y + 5);
      doc.text(s.client_name.length > 28 ? s.client_name.slice(0, 25) + '...' : s.client_name, 43, y + 5);
      doc.text(s.category, 105, y + 5);
      doc.text(s.payment_method, 153, y + 5);
      doc.setFont('Helvetica', 'bold');
      doc.text(formatRupees(s.amount), 190, y + 5, { align: 'right' });

      y += 7.5;
    });
  }

  // --- 6. DIVIDED BY CLIENT NAME ---
  y += 8;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('III. DIVIDED BY CLIENT NAME', 15, y);

  y += 4;
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, y, 180, 7.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Client Name', 18, y + 5);
  doc.text('Invoices Count', 110, y + 5, { align: 'right' });
  doc.text('Total Money Received', 190, y + 5, { align: 'right' });

  y += 7.5;

  const clientSummaryMap = new Map<string, { name: string; count: number; total: number }>();
  prevMonthSales.forEach(s => {
    const name = s.client_name || 'N/A';
    const key = name.trim().toLowerCase();
    const existing = clientSummaryMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += s.amount;
    } else {
      clientSummaryMap.set(key, { name, count: 1, total: s.amount });
    }
  });
  const clientSummaryList = Array.from(clientSummaryMap.values()).sort((a, b) => b.total - a.total);

  if (clientSummaryList.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(15, y, 180, 10, 'F');
    doc.setTextColor(120, 120, 120);
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('No transaction records found for this period.', 105, y + 6.5, { align: 'center' });
    y += 10;
  } else {
    clientSummaryList.forEach((c, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
        doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
        doc.line(15, y, 195, y);
        y += 5;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(15, y, 180, 7.5, 'F');
      doc.setDrawColor(235, 238, 242);
      doc.line(15, y + 7.5, 195, y + 7.5);

      doc.setTextColor(50, 50, 50);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(c.name, 18, y + 5);
      doc.text(String(c.count), 110, y + 5, { align: 'right' });
      doc.setFont('Helvetica', 'bold');
      doc.text(formatRupees(c.total), 190, y + 5, { align: 'right' });

      y += 7.5;
    });
  }

  if (y > 270) {
    doc.addPage();
    y = 20;
  }
  
  const footerY = 262;
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.line(15, footerY, 195, footerY);

  doc.setFontSize(7.5);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(110, 110, 110);
  doc.text('Tech4Geeky Internal Performance Summary Report. Confidential & Proprietary.', 15, footerY + 5);
  
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text('Tech4Geeky Systems Representative', 195, footerY + 5, { align: 'right' });

  return Buffer.from(doc.output('arraybuffer'));
}
