require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use(cors({
  origin: [
    'https://dotfive-n11dnrt2b-rrrr1124s-projects.vercel.app',
    'https://dotfive-cvjvq0c66-rrrr1124s-projects.vercel.app',
    'https://dotfive.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from the public directory
// Make sure your HTML files are in a 'public' folder or adjust the path accordingly
app.use(express.static(path.join(__dirname, 'public')));

// If your HTML files are in the root directory, use this instead:
app.use(express.static(__dirname));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Email configuration with better error handling
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
    return null;
  }

  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 60000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('Email transporter verification failed:', error);
    } else {
      console.log('Email transporter verified successfully');
    }
  });

  return transporter;
};

// Email templates
const createOrderEmailHTML = (orderId, customerData, cartData, total) => {
  // Handle both old and new customer data structures
  const customerName = customerData.fullName || customerData.name || 'Not provided';
  const customerEmail = customerData.email || 'Not provided';
  const customerPhone = customerData.phone || 'Not provided';
  
  let customerAddress = 'Not provided';
  if (customerData.address) {
    if (typeof customerData.address === 'string') {
      customerAddress = customerData.address;
    } else if (customerData.address.fullAddress) {
      customerAddress = customerData.address.fullAddress;
    } else {
      // Build address from components
      const addr = customerData.address;
      customerAddress = `${addr.houseNumber || ''}, Road ${addr.road || ''}, Block ${addr.block || ''}, ${addr.area || ''}, ${addr.country || ''}`.replace(/,\s*,/g, ',').trim();
    }
  }

  const itemsHTML = cartData.map(item => {
    let price = '0 BHD';
    if (typeof item.price === 'string') {
      price = item.price;
    } else if (typeof item.price === 'number') {
      price = `${item.price.toFixed(3)} BHD`;
    }

    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          ${item.name || item.productName || 'Product'}
          ${item.length ? `<br><small>Length: ${item.length}</small>` : ''}
          ${item.notes ? `<br><small>Notes: ${item.notes}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.quantity || 1}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ${price}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
        .order-details { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #e9ecef; padding: 12px; text-align: left; border: 1px solid #ddd; }
        td { padding: 10px; border: 1px solid #ddd; }
        .total { font-weight: bold; font-size: 18px; color: #28a745; margin-top: 20px; text-align: right; }
        .info-section { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
        .info-section h3 { margin-top: 0; color: #333; }
        .info-section p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #333; margin: 0;">New Order Received - Dot Five</h1>
          <h2 style="color: #666; margin: 10px 0 0 0;">Order #${orderId}</h2>
        </div>
        
        <div class="order-details">
          <div class="info-section">
            <h3>Customer Information:</h3>
            <p><strong>Name:</strong> ${customerName}</p>
            <p><strong>Email:</strong> ${customerEmail}</p>
            <p><strong>Phone:</strong> ${customerPhone}</p>
            <p><strong>Address:</strong> ${customerAddress}</p>
            ${customerData.orderNotes ? `<p><strong>Order Notes:</strong> ${customerData.orderNotes}</p>` : ''}
          </div>
          
          <h3>Order Items:</h3>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item Details</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
          
          <div class="total">
            <p>Total Amount: ${total.toFixed(3)} BHD</p>
          </div>
          
          <div class="info-section">
            <p><strong>Payment Screenshot:</strong> Attached to this email</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleString('en-US', { 
              timeZone: 'Asia/Bahrain',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
          </div>
        </div>
        
        <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px;">
          <h3 style="color: #856404; margin-top: 0;">Next Steps:</h3>
          <ul style="color: #856404; margin: 0; padding-left: 20px;">
            <li>Verify the payment screenshot</li>
            <li>Contact the customer to confirm delivery details</li>
            <li>Process the order and prepare for delivery</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    email_configured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    admin_email: process.env.ADMIN_EMAIL || 'Not configured'
  });
});

// Test email endpoint for debugging
app.get('/test-email', async (req, res) => {
  try {
    const transporter = createEmailTransporter();
    
    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: 'Email not configured'
      });
    }

    const testEmail = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: 'Test Email - Dot Five',
      html: '<h1>Test Email</h1><p>If you receive this, your email configuration is working!</p>'
    };

    await transporter.sendMail(testEmail);
    
    res.json({
      success: true,
      message: 'Test email sent successfully'
    });

  } catch (error) {
    console.error('Test email failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test email failed: ' + error.message,
      details: error.code || 'Unknown error'
    });
  }
});

// Submit order endpoint with email
app.post('/api/submit-order', upload.single('screenshot'), async (req, res) => {
  try {
    console.log('Order submission request received');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('File uploaded:', !!req.file);

    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Screenshot is required'
      });
    }

    // Parse the data
    let orderData, customerData, cartData;
    try {
      orderData = JSON.parse(req.body.orderData || '{}');
      customerData = JSON.parse(req.body.customerData || '{}');
      cartData = JSON.parse(req.body.cartData || '[]');
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format'
      });
    }

    // Validate required data
    if (!Array.isArray(cartData) || cartData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart data is required'
      });
    }

    // Calculate total
    const total = cartData.reduce((sum, item) => {
      let price = 0;
      if (typeof item.price === 'string') {
        price = parseFloat(item.price.replace(/BHD/gi, '').trim()) || 0;
      } else if (typeof item.price === 'number') {
        price = item.price;
      }
      return sum + (price * (item.quantity || 1));
    }, 0);

    // Generate order ID
    const orderId = orderData.orderId || ('ORD-' + Date.now());

    let emailSent = false;
    let emailError = null;

    // Send email notification
    try {
      const transporter = createEmailTransporter();
      
      if (!transporter) {
        throw new Error('Email transporter not configured');
      }

      const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
      
      if (!adminEmail) {
        throw new Error('Admin email not configured');
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: adminEmail,
        subject: `New Order #${orderId} - Dot Five`,
        html: createOrderEmailHTML(orderId, customerData, cartData, total),
        attachments: [{
          filename: `payment-${orderId}.${req.file.originalname.split('.').pop() || 'jpg'}`,
          content: req.file.buffer,
          contentType: req.file.mimetype
        }]
      };

      console.log('Sending email to:', adminEmail);
      const info = await transporter.sendMail(mailOptions);
      console.log('Order confirmation email sent successfully:', info.messageId);
      emailSent = true;

    } catch (error) {
      console.error('Email sending failed:', error);
      emailError = error.message;
      // Continue processing order even if email fails
    }

    // Send success response
    res.json({
      success: true,
      message: 'Order submitted successfully',
      data: {
        orderId: orderId,
        timestamp: new Date().toISOString(),
        items: cartData,
        customer: customerData,
        total: total.toFixed(3),
        emailSent: emailSent,
        emailError: emailError
      }
    });

    console.log('Order processed successfully:', orderId, 'Email sent:', emailSent);

  } catch (error) {
    console.error('Error processing order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  const baseUrl = `http://localhost:${PORT}`;
  
  console.log('\n🚀 Server is running successfully!');
  console.log('═'.repeat(50));
  console.log(`📍 Server URL: ${baseUrl}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   • Home Page:    ${baseUrl}/`);
  console.log(`   • Static Files: ${baseUrl}/<filename>.html`);
  console.log(`   • Health Check: ${baseUrl}/health`);
  console.log(`   • Test Email:   ${baseUrl}/test-email`);
  console.log(`   • Submit Order: ${baseUrl}/api/submit-order (POST)`);
  console.log('\n⚙️  Configuration:');
  console.log(`   • Email configured: ${!!(process.env.EMAIL_USER && process.env.EMAIL_PASS) ? '✅' : '❌'}`);
  console.log(`   • Admin email: ${process.env.ADMIN_EMAIL || process.env.EMAIL_USER || '❌ Not configured'}`);
  console.log(`   • Static files served from: ${path.join(__dirname)}`);
  console.log('═'.repeat(50));
  console.log('\n💡 Quick test: Visit the home page to see your website\n');
});