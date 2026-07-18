import { jsPDF } from 'jspdf';
import { Sale } from '../salesDb';

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
  const roundedAmount = Math.round(amount);
  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return `Rs. ${formatter.format(roundedAmount)}`;
}

// Helper function to format date to Indian Style (DD-MM-YYYY)
export function formatIndianDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.split(/[ T]/)[0].trim();
  
  let parts = cleanDate.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  parts = cleanDate.split('/');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY/MM/DD
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    } else if (parts[2].length === 4) {
      // DD/MM/YYYY
      const [day, month, year] = parts;
      return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }
  }
  
  return cleanDate;
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

// Convert Google Drive open links into a direct cross-origin image download URL
export function getGoogleDriveDirectUrl(url: string): string {
  let id = '';
  const matchId = url.match(/[?&]id=([^&#]+)/);
  if (matchId) {
    id = matchId[1];
  } else {
    const matchPath = url.match(/\/file\/d\/([^/&#]+)/);
    if (matchPath) {
      id = matchPath[1];
    }
  }
  if (id) {
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return url;
}

let cachedLogoBase64: string | null = null;

// Fetch Google Drive logo and convert to Base64, with a robust fallback to local canvas generation
export async function fetchLogoBase64(logoUrl: string): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64;
  // Generate the high-resolution dynamic canvas logo instantly.
  // This bypasses the slow Google Drive request and avoids CORS blockers on Netlify.
  cachedLogoBase64 = generateLogoBase64();
  return cachedLogoBase64;
}

// Generate the beautiful pixel-perfect TECH 4 GEEKY Logo on-the-fly inside the client browser.
// This matches the exact visual structure, colors, and font-weights of the official Logo.png image.
export function generateLogoBase64(): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Clear background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 150);

    // Left half: Black rectangle block (from x = 10 to 290)
    ctx.fillStyle = '#000000';
    ctx.fillRect(10, 10, 280, 130);

    // Right half: White rectangle block with thin black border (from x = 290 to 590)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(290, 10, 300, 130);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(290, 10, 300, 130);

    // Draw spaced white "TECH" text centered in the black block
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TECH', 150, 75);

    // Draw spaced black "GEEKY" text centered in the white block
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GEEKY', 450, 75);

    // Draw the stylized split digit "4" overlapping the center-line (x = 290)
    const drawFour = (color: string) => {
      ctx.fillStyle = color;
      ctx.font = '900 115px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('4', 290, 75);
    };

    // Left side of "4": rendered in White, clipped to the black block
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 290, 150);
    ctx.clip();
    drawFour('#ffffff');
    ctx.restore();

    // Right side of "4": rendered in Black, clipped to the white block
    ctx.save();
    ctx.beginPath();
    ctx.rect(290, 0, 310, 150);
    ctx.clip();
    drawFour('#000000');
    ctx.restore();

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to generate logo base64 dynamically:', error);
    return '';
  }
}

// Arithmetic expression evaluator helper for PDF generation
function evaluateArithmetic(input: string): number {
  if (!input) return 0;
  // Replace visual support characters to math safe operations
  const mathExpr = input.replace(/×/g, '*').replace(/÷/g, '/');
  // Only allow digits, arithmetic operators, parentheses, and spaces
  const safeExpr = mathExpr.replace(/[^0-9.\+\-\*\/\(\)\s]/g, '');
  try {
    if (!safeExpr.trim()) return 0;
    const result = new Function(`return (${safeExpr})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Math.round(result * 100) / 100;
    }
  } catch (e) {
    // fallback to parsing float
  }
  const floatVal = parseFloat(safeExpr);
  return isNaN(floatVal) ? 0 : floatVal;
}

// Deserialize description note back into structural breakdown rows for PDF generation
function deserializeVideoEditingRows(description: string, totalAmount: number): Array<{ desc: string; mins: string; rate: string }> {
  if (!description) return [{ desc: '', mins: '', rate: String(totalAmount) }];
  const parts = description.split('\n\n===METADATA===\n');
  if (parts.length === 2) {
    try {
      const parsed = JSON.parse(parts[1]);
      let rowsArray = [];
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rowsArray = parsed.rows || [];
      } else if (Array.isArray(parsed)) {
        rowsArray = parsed;
      }
      return rowsArray.map((item: any) => {
        if ('amt' in item && !('rate' in item)) {
          return {
            desc: item.desc || '',
            mins: '1',
            rate: item.amt || ''
          };
        }
        return {
          desc: item.desc || '',
          mins: item.mins || '',
          rate: item.rate || ''
        };
      });
    } catch {
      // fallback
    }
  }
  return [{ desc: description.split('===METADATA===')[0].trim(), mins: '1', rate: String(totalAmount) }];
}

function extractThumbnailAmount(description: string): number {
  if (!description) return 0;
  const parts = description.split('\n\n===METADATA===\n');
  if (parts.length === 2) {
    try {
      const parsed = JSON.parse(parts[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.thumbnail_amount !== undefined) {
        return Number(parsed.thumbnail_amount) || 0;
      }
    } catch {
      // ignore
    }
  }
  return 0;
}

export async function generateInvoicePDF(sale: Sale, salesList: Sale[] = []): Promise<void> {
  // Create instance of jsPDF (A4 page: 210mm x 297mm)
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

  // Color Palette Definitions (Match the beautiful Navy banner from template)
  const navyColor = [18, 34, 64]; // Custom Deep Navy
  const borderGrey = [180, 180, 180];
  const lightGrayBg = [248, 250, 252];

  // Dynamic UPI payment string for real transactions
  const upiUrl = `upi://pay?pa=ajaykumar6405-4@okicici&pn=TECH4GEEKY&am=${Math.round(sale.amount)}&cu=INR&tn=Invoice%20${invoiceNo}`;
  const logoUrl = 'https://drive.google.com/open?id=1kVnKI3jYuJO4QkmBtig52cargj1MGR92&usp=drive_fs';

  // Load both resources in parallel to maximize speed
  const [qrBase64, logoBase64] = await Promise.all([
    fetchQRCodeBase64(upiUrl),
    fetchLogoBase64(logoUrl)
  ]);

  // --- 1. BRANDING HEADER BANNER ---
  // Solid Navy blue header rectangle
  doc.setFillColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.rect(15, 15, 180, 32, 'F');

  if (logoBase64) {
    const format = logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(logoBase64, format, 25, 18, 68, 17);
  }

  // Slogan text below logo (Centered precisely inside the Navy banner relative to the logo center)
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
  const isVideoEditing = sale.category === 'Video editing';
  const startX = 15;
  const endX = 195;
  const colX = isVideoEditing ? [15, 27, 49, 135, 160, 195] : [15, 30, 55, 160, 195];
  const tableY = 78;

  // Header Row Box
  doc.rect(startX, tableY, endX - startX, 10);
  // Column dividers for headers
  colX.slice(1, -1).forEach(x => {
    doc.line(x, tableY, x, tableY + 10);
  });

  doc.setFontSize(9.5);
  doc.setFont('Helvetica', 'bold');
  if (isVideoEditing) {
    doc.text('SL.', 21, tableY + 4, { align: 'center' });
    doc.text('No', 21, tableY + 8, { align: 'center' });
    doc.text('Date', 38, tableY + 6, { align: 'center' });
    doc.text('Description', 92, tableY + 6, { align: 'center' });
    doc.text('Minutes', 147.5, tableY + 6, { align: 'center' });
    doc.text('Total Amount', 177.5, tableY + 6, { align: 'center' });
  } else {
    doc.text('SL.', 22.5, tableY + 4, { align: 'center' });
    doc.text('No', 22.5, tableY + 8, { align: 'center' });
    doc.text('Date', 42.5, tableY + 6, { align: 'center' });
    doc.text('Description', 107.5, tableY + 6, { align: 'center' });
    doc.text('Amount', 177.5, tableY + 6, { align: 'center' });
  }

  // Prepare table row items dynamically
  interface TableRowItem {
    slNo: string;
    date: string;
    descriptionLines: string[];
    minutes?: string;
    amount: number;
  }

  const itemsToPrint: TableRowItem[] = [];

  if (isVideoEditing) {
    const vRows = deserializeVideoEditingRows(sale.description || '', sale.amount);
    vRows.forEach((row, index) => {
      const minsVal = evaluateArithmetic(row.mins);
      const rateVal = evaluateArithmetic(row.rate);
      const subtotal = minsVal * rateVal;
      
      const descText = row.desc ? row.desc.trim() : 'Video Editing Service';
      const mainLines = doc.splitTextToSize(descText, 76);

      itemsToPrint.push({
        slNo: String(index + 1),
        date: index === 0 ? formatIndianDate(sale.sale_date) : '', // print date on first row only for neatness
        descriptionLines: mainLines,
        minutes: `${row.mins || '0'}`,
        amount: subtotal
      });
    });

    const thumbnailAmt = extractThumbnailAmount(sale.description || '');
    if (thumbnailAmt > 0) {
      itemsToPrint.push({
        slNo: String(itemsToPrint.length + 1),
        date: '',
        descriptionLines: doc.splitTextToSize('Thumbnail Charges', 76),
        minutes: '-',
        amount: thumbnailAmt
      });
    }
  } else {
    // Other categories: print single row
    const serviceText = sale.description ? sale.description.trim() : sale.category;
    const mainLines = doc.splitTextToSize(serviceText, 100);
    itemsToPrint.push({
      slNo: '1',
      date: formatIndianDate(sale.sale_date),
      descriptionLines: mainLines,
      amount: sale.amount
    });
  }

  let currentY = tableY + 10;
  
  itemsToPrint.forEach((item) => {
    // Calculate required height for this row
    // Each line takes 4.5mm. Plus 5mm top/bottom padding.
    const textHeight = item.descriptionLines.length * 4.5;
    const rowHeight = Math.max(12, textHeight + 5);

    // Draw row rectangle
    doc.setFillColor(255, 255, 255);
    doc.rect(startX, currentY, endX - startX, rowHeight, 'S');

    // Draw column dividers for this row
    colX.slice(1, -1).forEach(x => {
      doc.line(x, currentY, x, currentY + rowHeight);
    });

    // Draw Serial Number
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(item.slNo, isVideoEditing ? 21 : 22.5, currentY + (rowHeight / 2) + 1, { align: 'center' });

    // Draw Date
    doc.text(item.date, isVideoEditing ? 38 : 42.5, currentY + (rowHeight / 2) + 1, { align: 'center' });

    // Draw Description Lines
    let lineY = currentY + 5;
    item.descriptionLines.forEach((line) => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text(line, isVideoEditing ? 52 : 58, lineY);
      lineY += 4.5;
    });

    // Draw Minutes if present
    if (isVideoEditing && item.minutes) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text(item.minutes, 147.5, currentY + (rowHeight / 2) + 1, { align: 'center' });
    }

    // Draw Amount
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    const amtStr = formatRupees(item.amount);
    doc.text(amtStr, 177.5, currentY + (rowHeight / 2) + 1, { align: 'center' });

    // Advance currentY
    currentY += rowHeight;
  });


  // --- 5. SUMMARY CELLS (ROUND OFF & TOTAL) ---
  const roundOffY = currentY;
  doc.rect(startX, roundOffY, endX - startX, 8);
  doc.line(160, roundOffY, 160, roundOffY + 8);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('(-) Round off', 155, roundOffY + 5.5, { align: 'right' });
  doc.text('-', 177.5, roundOffY + 5.5, { align: 'center' });

  const totalPayableY = roundOffY + 8;
  doc.rect(startX, totalPayableY, endX - startX, 8);
  doc.line(160, totalPayableY, 160, totalPayableY + 8);
  doc.setFont('Helvetica', 'bold');
  doc.text('Total Payable', 155, totalPayableY + 5.5, { align: 'right' });
  
  const formattedAmount = formatRupees(sale.amount);
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
  doc.setFontSize(10);
  doc.text('Payment Details:', 20, paymentBlockY + 6);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 110);
  doc.text('Kindly complete the payment via Bank Details Provided:', 20, paymentBlockY + 11);

  // Columnar Aligned Bank Account Details (Labels at X=20, Values perfectly aligned at X=48)
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
  doc.setTextColor(0, 102, 204); // Blue hyperlink color
  doc.text('ajaykumar6405-4@okicici', 48, detailsOffset + 12);
  
  // Underline the UPI ID in Payment Details
  const upiWidthInDetails = doc.getTextWidth('ajaykumar6405-4@okicici');
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.2);
  doc.line(48, detailsOffset + 12 + 0.4, 48 + upiWidthInDetails, detailsOffset + 12 + 0.4);
  
  // Make active clickable hyperlink on the UPI ID in Payment Details
  doc.link(48, detailsOffset + 12 - 5, upiWidthInDetails + 5, 8, { url: upiUrl });

  doc.setTextColor(120, 120, 120);
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text('Due Date: 5 days from the date of this invoice.', 20, detailsOffset + 19);

  // Right Section: Scan & Pay QR Code Box
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.line(135, paymentBlockY, 135, paymentBlockY + 52); // Splitter line

  const qrSize = 42;
  const qrX = 135 + (60 - qrSize) / 2; // Center horizontally in the 60-unit wide right section
  const qrY = paymentBlockY + (52 - qrSize) / 2; // Center vertically in the 52-unit high box

  if (qrBase64) {
    // Render working QR Code dynamically fetched from standard QR API
    doc.addImage(qrBase64, 'PNG', qrX, qrY, qrSize, qrSize);
    // Make the QR code image clickable as well
    doc.link(qrX, qrY, qrSize, qrSize, { url: upiUrl });
  } else {
    // If offline/API fails, show a beautiful visual QR code placeholder
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
    
    // Make active clickable hyperlink on the QR area
    doc.link(qrX, qrY, qrSize, qrSize, { url: upiUrl });
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

async function buildMonthlySummaryPDFDocument(sales: Sale[]): Promise<{ doc: jsPDF; fileName: string }> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const navyColor = [18, 34, 64];
  const borderGrey = [180, 180, 180];
  const lightGrayBg = [248, 250, 252];

  // Calculate previous month dynamically based on current date
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthName = prevMonthDate.toLocaleString('en-US', { month: 'long' });
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthLabel = `${prevMonthName} ${prevYear}`;
  const prevMonthYMD = `${prevYear}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Filter previous month sales
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

  // Fetch/generate logo base64
  const logoUrl = 'https://drive.google.com/open?id=1kVnKI3jYuJO4QkmBtig52cargj1MGR92&usp=drive_fs';
  const logoBase64 = await fetchLogoBase64(logoUrl);
  if (logoBase64) {
    const format = logoBase64.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(logoBase64, format, 25, 18, 68, 17);
  }

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

  // Box border
  doc.setDrawColor(borderGrey[0], borderGrey[1], borderGrey[2]);
  doc.setLineWidth(0.35);
  doc.setFillColor(lightGrayBg[0], lightGrayBg[1], lightGrayBg[2]);
  doc.rect(15, y, 180, 24, 'FD');

  // Metric 1: Total Revenue
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('TOTAL REVENUE', 20, y + 7);
  doc.setFontSize(13);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text(formatRupees(totalRevenue), 20, y + 16);

  // Metric 2: Total Invoices
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('TOTAL INVOICES', 85, y + 7);
  doc.setFontSize(13);
  doc.setTextColor(navyColor[0], navyColor[1], navyColor[2]);
  doc.text(`${totalCount} Sales`, 85, y + 16);

  // Metric 3: Average Order Value (AOV)
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
  // Table Header
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
    // Alternating background
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
  // Table Header
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
      // Check page overflow
      if (y > 265) {
        doc.addPage();
        y = 20;
        // Draw top border/line
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
  // Table Header
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
      // Check page overflow
      if (y > 265) {
        doc.addPage();
        y = 20;
        // Draw top border/line
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

  // Draw final footer boundary
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

  // Save PDF
  const reportFileName = `Tech4Geeky_Summary_${prevMonthLabel.replace(/\s+/g, '_')}.pdf`;
  return { doc, fileName: reportFileName };
}

export async function generateMonthlySummaryPDF(sales: Sale[]): Promise<void> {
  const { doc, fileName } = await buildMonthlySummaryPDFDocument(sales);
  doc.save(fileName);
}

export async function generateMonthlySummaryPDFBase64(sales: Sale[]): Promise<{ fileName: string; base64: string }> {
  const { doc, fileName } = await buildMonthlySummaryPDFDocument(sales);
  const base64 = doc.output('datauristring').split(',').pop() as string;
  return { fileName, base64 };
}
