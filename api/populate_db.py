# populate_db.py
from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from uuid import uuid4
import os

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+mysqlconnector://db_user:Admin123.@mysql:3306/db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models (same as in main.py)
class Product(Base):
    __tablename__ = "products"
    
    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    category = Column(String(100))
    price = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Company(Base):
    __tablename__ = "companies"
    
    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    contact_email = Column(String(255))
    contact_phone = Column(String(20))
    address = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class Stock(Base):
    __tablename__ = "stocks"
    
    id = Column(String(36), primary_key=True, index=True)
    product_id = Column(String(36), ForeignKey("products.id"))
    company_id = Column(String(36), ForeignKey("companies.id"))
    quantity = Column(Integer, nullable=False)
    last_updated = Column(DateTime, default=datetime.utcnow)

class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    address = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class OrderItem(Base):
    __tablename__ = "order_items"
    
    id = Column(String(36), primary_key=True, index=True)
    order_id = Column(String(36), ForeignKey("orders.id"))
    product_id = Column(String(36), ForeignKey("products.id"))
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)

class Order(Base):
    __tablename__ = "orders"
    
    id = Column(String(36), primary_key=True, index=True)
    customer_id = Column(String(36), ForeignKey("customers.id"))
    total_amount = Column(Float, nullable=False)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Populate database
def populate_database():
    db = SessionLocal()
    
    try:
        # Create sample products
        products = [
            Product(id=str(uuid4()), name="Laptop", description="High-performance laptop", category="Electronics", price=999.99),
            Product(id=str(uuid4()), name="Desk Chair", description="Ergonomic office chair", category="Furniture", price=199.99),
            Product(id=str(uuid4()), name="Coffee Maker", description="Automatic coffee maker", category="Appliances", price=79.99),
        ]
        
        # Create sample companies
        companies = [
            Company(id=str(uuid4()), name="TechCorp", contact_email="info@techcorp.com", contact_phone="123-456-7890", address="123 Tech St, Silicon Valley"),
            Company(id=str(uuid4()), name="Office Supplies Inc", contact_email="contact@officesupplies.com", contact_phone="098-765-4321", address="456 Office Ave, New York"),
        ]
        
        # Create sample customers
        customers = [
            Customer(id=str(uuid4()), name="John Doe", email="john@example.com", phone="555-0101", address="789 Main St, Anytown"),
            Customer(id=str(uuid4()), name="Jane Smith", email="jane@example.com", phone="555-0102", address="101 Oak St, Somewhere"),
        ]
        
        # Add to database
        for product in products:
            db.add(product)
        for company in companies:
            db.add(company)
        for customer in customers:
            db.add(customer)
            
        db.commit()
        
        # Create sample stocks
        stocks = [
            Stock(id=str(uuid4()), product_id=products[0].id, company_id=companies[0].id, quantity=50),
            Stock(id=str(uuid4()), product_id=products[1].id, company_id=companies[1].id, quantity=100),
            Stock(id=str(uuid4()), product_id=products[2].id, company_id=companies[0].id, quantity=200),
        ]
        
        for stock in stocks:
            db.add(stock)
            
        db.commit()
        
        # Create sample orders first
        orders = [
            Order(id=str(uuid4()), customer_id=customers[0].id, total_amount=1159.97, status="completed"),
            Order(id=str(uuid4()), customer_id=customers[1].id, total_amount=159.98, status="pending"),
        ]
        
        for order in orders:
            db.add(order)
            
        db.commit()
        
        # Then create order items referencing the orders
        order_items = [
            OrderItem(id=str(uuid4()), order_id=orders[0].id, product_id=products[0].id, quantity=1, price=999.99),
            OrderItem(id=str(uuid4()), order_id=orders[1].id, product_id=products[2].id, quantity=2, price=79.99),
        ]
        
        for item in order_items:
            db.add(item)
            
        db.commit()
        print("Database populated with sample data!")
        
    except Exception as e:
        print(f"Error populating database: {e}")
        db.rollback()
    finally:
        db.close()
        
if __name__ == "__main__":
    populate_database()