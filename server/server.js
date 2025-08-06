const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

const cors = require('cors');

const cors = require('cors');

app.use(cors({
  origin: [
    'https://dotfive.vercel.app',
    'https://dotfive.neocities.org', // if you have one
    'http://localhost:3000' // for local development
  ],
  credentials: true
}));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public')); // Serve static files from public folder

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // Files will be saved in uploads folder
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp + original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'payment-screenshot-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Only allow image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Configure nodemailer (email service)
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use other services like 'outlook', 'yahoo', etc.
    auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS  // Your email password or app password
    }
});

// Test email endpoint
app.get('/api/test-email', async (req, res) => {
    try {
        const testMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            subject: 'Test Email from Dot Five Server',
            text: 'This is a test email to verify email configuration!'
        };

        await transporter.sendMail(testMailOptions);
        res.json({ success: true, message: 'Test email sent!' });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test email configuration
transporter.verify(function(error, success) {
    if (error) {
        console.log('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running!' });
});

// Handle order submission with file upload
app.post('/api/submit-order', upload.single('screenshot'), async (req, res) => {
    try {
        console.log('Received order submission');
        console.log('File:', req.file);
        console.log('Body keys:', Object.keys(req.body));
        console.log('Raw body:', req.body);

        // Parse order data from the request with better error handling
        let orderData = {};
        let customerData = {};
        let cartData = [];

        try {
            // Handle different possible field names
            if (req.body.orderData) {
                orderData = JSON.parse(req.body.orderData);
            } else if (req.body.orderSummary) {
                const orderSummary = JSON.parse(req.body.orderSummary);
                orderData = orderSummary;
                customerData = orderSummary.customerData || {};
                cartData = orderSummary.items || [];
            }

            if (req.body.customerData) {
                customerData = JSON.parse(req.body.customerData);
            }

            if (req.body.cartData) {
                cartData = JSON.parse(req.body.cartData);
            }

            // If no separate cart data, try to get from order data
            if (cartData.length === 0 && orderData.items) {
                cartData = orderData.items;
            }

        } catch (parseError) {
            console.error('Error parsing request data:', parseError);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid data format in request' 
            });
        }

        console.log('Parsed customerData:', customerData);
        console.log('Parsed cartData:', cartData);

        // Validate required data
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment screenshot is required' 
            });
        }

        if (!cartData || cartData.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cart data is required' 
            });
        }

        // Generate order number (use existing if available, otherwise create new)
        const orderNumber = orderData.orderId || customerData.orderId || ('ORD-' + Date.now());

        // Calculate total amount
        let totalAmount = 0;
        cartData.forEach(item => {
            let priceValue = 0;
            if (typeof item.price === 'string') {
                const cleanPrice = item.price.replace(/BHD/gi, '').trim();
                priceValue = parseFloat(cleanPrice) || 0;
            } else if (typeof item.price === 'number') {
                priceValue = item.price;
            }
            const quantity = item.quantity || 1;
            totalAmount += priceValue * quantity;
        });

        // Use provided total if available
        if (orderData.totalAmount) {
            totalAmount = parseFloat(orderData.totalAmount) || totalAmount;
        }

        // Extract customer information with fallbacks
        const customerInfo = {
            fullName: customerData.fullName || 'N/A',
            email: customerData.email || 'N/A',
            phone: customerData.phone || (customerData.countryCode + customerData.phoneNumber) || 'N/A',
            countryCode: customerData.countryCode || 'N/A',
            phoneNumber: customerData.phoneNumber || 'N/A',
            address: formatAddress(customerData.address) || 'N/A',
            orderNotes: customerData.orderNotes || 'None'
        };

        // Prepare detailed order items text
        const orderItemsText = cartData.map((item, index) => {
            const quantity = item.quantity || 1;
            let priceValue = 0;
            
            if (typeof item.price === 'string') {
                const cleanPrice = item.price.replace(/BHD/gi, '').trim();
                priceValue = parseFloat(cleanPrice) || 0;
            } else if (typeof item.price === 'number') {
                priceValue = item.price;
            }
            
            const totalItemPrice = (priceValue * quantity).toFixed(3);
            
            let itemText = `${index + 1}. ${item.productName || item.name || 'Unknown Product'}`;
            itemText += `\n   • Price: ${priceValue.toFixed(3)} BHD each`;
            itemText += `\n   • Quantity: ${quantity}`;
            itemText += `\n   • Subtotal: ${totalItemPrice} BHD`;
            
            if (item.length) {
                itemText += `\n   • Abaya Length: ${item.length}`;
            }
            if (item.notes) {
                itemText += `\n   • Notes: ${item.notes}`;
            }
            
            return itemText;
        }).join('\n\n');

        // Enhanced admin email content with better formatting
        const adminEmailContent = `
🎉 NEW ORDER RECEIVED - DOT FIVE 🎉

═════════════════════════════════════════════════════════════
📋 ORDER SUMMARY
═════════════════════════════════════════════════════════════
Order Number: ${orderNumber}
Order Date: ${new Date().toLocaleString('en-BH', { 
    timeZone: 'Asia/Bahrain',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
})}
Total Amount: ${totalAmount.toFixed(3)} BHD
Total Items: ${cartData.length}

═════════════════════════════════════════════════════════════
👤 CUSTOMER DETAILS
═════════════════════════════════════════════════════════════
Full Name: ${customerInfo.fullName}
Email: ${customerInfo.email}
Phone: ${customerInfo.phone}
Country Code: ${customerInfo.countryCode}
Phone Number: ${customerInfo.phoneNumber}

📍 DELIVERY ADDRESS:
${customerInfo.address}

📝 ORDER NOTES:
${customerInfo.orderNotes}

═════════════════════════════════════════════════════════════
🛍️ ORDERED ITEMS
═════════════════════════════════════════════════════════════
${orderItemsText}

═════════════════════════════════════════════════════════════
💳 PAYMENT INFORMATION
═════════════════════════════════════════════════════════════
Payment Screenshot: ATTACHED
Original Filename: ${req.file.originalname}
Server Filename: ${req.file.filename}
File Size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB
Upload Time: ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}

═════════════════════════════════════════════════════════════
⚠️ ACTION REQUIRED
═════════════════════════════════════════════════════════════
1. Verify the payment screenshot attached to this email
2. Confirm the payment amount matches: ${totalAmount.toFixed(3)} BHD
3. Process the order and prepare items for delivery
4. Contact customer at ${customerInfo.phone} or ${customerInfo.email}

═════════════════════════════════════════════════════════════

This is an automated notification from your Dot Five order system.
        `;

        // Email options for admin/business owner with HTML version
        const adminMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            subject: `🚨 NEW ORDER #${orderNumber} - ${totalAmount.toFixed(3)} BHD - ${customerInfo.fullName}`,
            text: adminEmailContent,
            html: createHTMLEmail(orderNumber, customerInfo, cartData, totalAmount, req.file),
            attachments: [{
                filename: `Payment-Screenshot-${orderNumber}.${req.file.originalname.split('.').pop()}`,
                path: req.file.path,
                contentType: req.file.mimetype
            }]
        };

        // Send email to admin
        console.log('Sending order notification to admin:', process.env.ADMIN_EMAIL || process.env.EMAIL_USER);
        await transporter.sendMail(adminMailOptions);
        console.log('Admin notification email sent successfully!');

        // Send confirmation email to customer if email is provided
        if (customerInfo.email && customerInfo.email !== 'N/A') {
            const customerMailOptions = {
                from: process.env.EMAIL_USER,
                to: customerInfo.email,
                subject: `Order Confirmation - ${orderNumber} - Dot Five`,
                text: `
Dear ${customerInfo.fullName},

Thank you for your order with Dot Five! 🎉

═══════════════════════════════════════
ORDER CONFIRMATION
═══════════════════════════════════════
Order Number: ${orderNumber}
Order Date: ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}
Total Amount: ${totalAmount.toFixed(3)} BHD

═══════════════════════════════════════
ORDERED ITEMS
═══════════════════════════════════════
${cartData.map((item, index) => {
    const quantity = item.quantity || 1;
    return `${index + 1}. ${item.productName || item.name} (Qty: ${quantity})`;
}).join('\n')}

═══════════════════════════════════════
DELIVERY ADDRESS
═══════════════════════════════════════
${customerInfo.address}

═══════════════════════════════════════
NEXT STEPS
═══════════════════════════════════════
✅ We have received your payment screenshot
✅ Our team will verify your payment
✅ We will prepare your order for delivery
✅ You will receive updates on your order status

If you have any questions, please contact us or reply to this email.

Thank you for choosing Dot Five!

Best regards,
The Dot Five Team
                `,
                html: createCustomerHTMLEmail(orderNumber, customerInfo, cartData, totalAmount)
            };
            
            try {
                await transporter.sendMail(customerMailOptions);
                console.log('Customer confirmation email sent successfully to:', customerInfo.email);
            } catch (customerEmailError) {
                console.log('Failed to send customer confirmation email:', customerEmailError);
                // Don't fail the whole request if customer email fails
            }
        }

        // Return success response
        res.json({
            success: true,
            message: 'Order submitted successfully! Email notifications have been sent.',
            orderNumber: orderNumber,
            data: {
                orderNumber,
                totalAmount: totalAmount.toFixed(3),
                orderDate: new Date().toISOString(),
                items: cartData,
                customer: customerInfo,
                screenshotUploaded: true,
                screenshotFilename: req.file.filename,
                adminEmailSent: true,
                customerEmailSent: customerInfo.email !== 'N/A'
            }
        });

    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process order. Please try again.',
            error: error.message
        });
    }
});

// Helper function to format address
function formatAddress(address) {
    if (!address) return 'No address provided';
    
    if (typeof address === 'string') return address;
    
    if (typeof address === 'object') {
        const parts = [];
        if (address.houseNumber) parts.push(`House: ${address.houseNumber}`);
        if (address.road) parts.push(`Road: ${address.road}`);
        if (address.block) parts.push(`Block: ${address.block}`);
        if (address.area) parts.push(`Area: ${address.area}`);
        if (address.country) parts.push(`Country: ${address.country}`);
        if (address.additionalDirections) parts.push(`Directions: ${address.additionalDirections}`);
        
        return parts.length > 0 ? parts.join('\n') : address.fullAddress || 'Address details incomplete';
    }
    
    return 'Invalid address format';
}

// Helper function to create HTML email for admin
function createHTMLEmail(orderNumber, customerInfo, cartData, totalAmount, file) {
    const itemsHTML = cartData.map((item, index) => {
        const quantity = item.quantity || 1;
        let priceValue = 0;
        
        if (typeof item.price === 'string') {
            const cleanPrice = item.price.replace(/BHD/gi, '').trim();
            priceValue = parseFloat(cleanPrice) || 0;
        } else if (typeof item.price === 'number') {
            priceValue = item.price;
        }
        
        const totalItemPrice = (priceValue * quantity).toFixed(3);
        
        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; border: 1px solid #ddd;">${index + 1}</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${item.productName || item.name || 'Unknown Product'}</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${priceValue.toFixed(3)} BHD</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${quantity}</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${totalItemPrice} BHD</td>
            <td style="padding: 12px; border: 1px solid #ddd;">${item.length || 'N/A'}</td>
        </tr>
        `;
    }).join('');

    return `
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2c3e50; text-align: center; border-bottom: 3px solid #3498db; padding-bottom: 10px;">
                🎉 NEW ORDER RECEIVED - DOT FIVE 🎉
            </h1>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">📋 Order Summary</h2>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                <p><strong>Order Date:</strong> ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}</p>
                <p><strong>Total Amount:</strong> <span style="color: #e74c3c; font-size: 1.2em; font-weight: bold;">${totalAmount.toFixed(3)} BHD</span></p>
                <p><strong>Total Items:</strong> ${cartData.length}</p>
            </div>

            <div style="background: #e8f6f3; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">👤 Customer Details</h2>
                <p><strong>Name:</strong> ${customerInfo.fullName}</p>
                <p><strong>Email:</strong> ${customerInfo.email}</p>
                <p><strong>Phone:</strong> ${customerInfo.phone}</p>
                <p><strong>Address:</strong></p>
                <pre style="background: white; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${customerInfo.address}</pre>
                <p><strong>Order Notes:</strong> ${customerInfo.orderNotes}</p>
            </div>

            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">🛍️ Ordered Items</h2>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #3498db; color: white;">
                            <th style="padding: 12px; border: 1px solid #ddd;">#</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Product</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Price</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Qty</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Subtotal</th>
                            <th style="padding: 12px; border: 1px solid #ddd;">Length</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>
            </div>

            <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">💳 Payment Information</h2>
                <p><strong>Screenshot Attached:</strong> ✅ Yes</p>
                <p><strong>Original Filename:</strong> ${file.originalname}</p>
                <p><strong>File Size:</strong> ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>Upload Time:</strong> ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}</p>
            </div>

            <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 5px solid #dc3545;">
                <h2 style="color: #721c24; margin-top: 0;">⚠️ Action Required</h2>
                <ol style="color: #721c24;">
                    <li>Verify the payment screenshot attached to this email</li>
                    <li>Confirm the payment amount matches: <strong>${totalAmount.toFixed(3)} BHD</strong></li>
                    <li>Process the order and prepare items for delivery</li>
                    <li>Contact customer at <strong>${customerInfo.phone}</strong> or <strong>${customerInfo.email}</strong></li>
                </ol>
            </div>

            <footer style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666;">
                <p>This is an automated notification from your Dot Five order system.</p>
                <p style="font-size: 0.9em;">Generated on ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}</p>
            </footer>
        </div>
    </body>
    </html>
    `;
}

// Helper function to create HTML email for customer
function createCustomerHTMLEmail(orderNumber, customerInfo, cartData, totalAmount) {
    const itemsHTML = cartData.map((item, index) => {
        const quantity = item.quantity || 1;
        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${item.productName || item.name || 'Unknown Product'}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${quantity}</td>
        </tr>
        `;
    }).join('');

    return `
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2c3e50; text-align: center;">Thank You for Your Order! 🎉</h1>
            
            <div style="background: #e8f6f3; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">Order Confirmation</h2>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                <p><strong>Total Amount:</strong> <span style="color: #e74c3c; font-size: 1.2em;">${totalAmount.toFixed(3)} BHD</span></p>
                <p><strong>Order Date:</strong> ${new Date().toLocaleString('en-BH', { timeZone: 'Asia/Bahrain' })}</p>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">Your Items</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #3498db; color: white;">
                            <th style="padding: 10px; border: 1px solid #ddd;">#</th>
                            <th style="padding: 10px; border: 1px solid #ddd;">Product</th>
                            <th style="padding: 10px; border: 1px solid #ddd;">Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHTML}
                    </tbody>
                </table>
            </div>

            <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2 style="color: #2c3e50; margin-top: 0;">Next Steps</h2>
                <ul>
                    <li>✅ We have received your payment screenshot</li>
                    <li>🔍 Our team will verify your payment</li>
                    <li>📦 We will prepare your order for delivery</li>
                    <li>📱 You will receive updates on your order status</li>
                </ul>
            </div>

            <footer style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <p>Thank you for choosing <strong>Dot Five</strong>!</p>
                <p style="color: #666;">If you have any questions, please reply to this email.</p>
            </footer>
        </div>
    </body>
    </html>
    `;
}

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    res.status(500).json({
        success: false,
        message: error.message || 'Something went wrong!'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API endpoints available at:`);
    console.log(`• GET  http://localhost:${PORT}/api/health`);
    console.log(`• POST http://localhost:${PORT}/api/submit-order`);
    console.log(`• GET  http://localhost:${PORT}/api/test-email`);
    console.log(`Admin email configured: ${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}`);
});