# 🏋️‍♂️ Decentralized Workout Plan Sharing

Welcome to a decentralized application on the Stacks blockchain that revolutionizes how fitness enthusiasts share and monetize workout plans using Web3 technology. Creators can publish workout plans, set prices in STX tokens, and users can purchase access to these plans securely, fostering a community-driven fitness ecosystem.

## ✨ Features

💪 Publish and share workout plans with detailed metadata  
💸 Monetize plans with STX token payments  
🔒 Secure access control for purchased plans  
📊 Track plan popularity and creator earnings  
🌐 Decentralized, transparent, and immutable storage  
🔍 Discover and filter workout plans by category or creator  
✅ Verify purchase and access rights instantly  

## 🛠 How It Works

**For Creators**  
- Create a workout plan with details (title, description, exercises, category, price).  
- Generate a unique hash for the plan to ensure integrity.  
- Call `publish-plan` to register the plan on the blockchain.  
- Set a price in STX tokens for users to access your plan.  
- Earn tokens when users purchase your plan.  

**For Users**  
- Browse available workout plans using `list-plans`.  
- Purchase a plan by calling `purchase-plan` and paying the required STX tokens.  
- Access purchased plans securely via `access-plan`.  
- Verify ownership of a plan with `verify-purchase`.  

**For Everyone**  
- Explore trending plans with `get-popular-plans`.  
- Check creator earnings and plan stats with `get-creator-stats`.  

