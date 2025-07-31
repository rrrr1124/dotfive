const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

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
        console.log('Body:', req.body);

        // Parse order data from the request
        const orderData = JSON.parse(req.body.orderData || '{}');
        const customerData = JSON.parse(req.body.customerData || '{}');
        const cartData = JSON.parse(req.body.cartData || '[]');

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

        // Generate order number
        const orderNumber = 'ORD-' + Date.now();

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

        // Prepare email content for you (the admin)
        const orderItemsText = cartData.map(item => {
            const quantity = item.quantity || 1;
            let priceText = typeof item.price === 'string' ? item.price : item.price + ' BHD';
            return `• ${item.productName || item.name} - ${priceText} ${item.length ? '(Length: ' + item.length + ')' : ''} (Qty: ${quantity})`;
        }).join('\n');

        const adminEmailContent = `
🎉 NEW ORDER RECEIVED! 🎉

═══════════════════════════════════════
📋 ORDER DETAILS
═══════════════════════════════════════
Order Number: ${orderNumber}
Order Date: ${new Date().toLocaleString()}
Total Amount: ${totalAmount.toFixed(3)} BHD

═══════════════════════════════════════
👤 CUSTOMER INFORMATION
═══════════════════════════════════════
Name: ${customerData.fullName || 'N/A'}
Email: ${customerData.email || 'N/A'}
Phone: ${customerData.phone || 'N/A'}
Address: ${customerData.address || 'N/A'}

═══════════════════════════════════════
🛍️ ORDER ITEMS
═══════════════════════════════════════
${orderItemsText}

═══════════════════════════════════════
💳 PAYMENT INFORMATION
═══════════════════════════════════════
Payment Screenshot: Attached (${req.file.originalname})
Screenshot File: ${req.file.filename}
Upload Time: ${new Date().toLocaleString()}

Please verify the payment screenshot and process the order accordingly.
        `;

        // Email options for YOU (the admin/business owner)
        const adminMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER, // This is YOUR email
            subject: `🚨 NEW ORDER #${orderNumber} - ${totalAmount.toFixed(3)} BHD`,
            text: adminEmailContent,
            attachments: [{
                filename: `Payment-Screenshot-${orderNumber}.${req.file.originalname.split('.').pop()}`,
                path: req.file.path,
                contentType: req.file.mimetype
            }]
        };

        // Send email to YOU
        console.log('Sending order notification to admin:', process.env.ADMIN_EMAIL || process.env.EMAIL_USER);
        await transporter.sendMail(adminMailOptions);
        console.log('Admin notification email sent successfully!');

        // Send confirmation email to customer (optional)
        if (customerData.email) {
            const customerMailOptions = {
                from: process.env.EMAIL_USER,
                to: customerData.email,
                subject: `Order Confirmation - ${orderNumber}`,
                text: `
Dear ${customerData.fullName || 'Customer'},

Thank you for your order!

Order Number: ${orderNumber}
Total Amount: ${totalAmount.toFixed(3)} BHD

We have received your payment screenshot and will process your order shortly.
You will receive updates on your order status.

Best regards,
Dot Five Team
                `
            };
            
            try {
                await transporter.sendMail(customerMailOptions);
                console.log('Customer confirmation email sent successfully!');
            } catch (customerEmailError) {
                console.log('Failed to send customer confirmation email:', customerEmailError);
                // Don't fail the whole request if customer email fails
            }
        }

        // Clean up: Optionally delete the uploaded file after sending email
        // Uncomment the lines below if you want to delete files after sending
        /*
        setTimeout(() => {
            fs.unlink(req.file.path, (err) => {
                if (err) console.log('Error deleting file:', err);
                else console.log('Uploaded file deleted:', req.file.filename);
            });
        }, 5000); // Delete after 5 seconds
        */

        // Return success response
        res.json({
            success: true,
            message: 'Order submitted successfully! You will receive an email notification.',
            orderNumber: orderNumber,
            data: {
                orderNumber,
                totalAmount: totalAmount.toFixed(3),
                orderDate: new Date().toISOString(),
                items: cartData,
                customer: customerData,
                screenshotUploaded: true,
                screenshotFilename: req.file.filename
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
    console.log(`Admin email configured: ${process.env.ADMIN_EMAIL || process.env.EMAIL_USER}`);
});