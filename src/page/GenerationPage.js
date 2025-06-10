import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Container, Row, Col, Form, Button, Card } from "react-bootstrap";

import api from "../api";

const GenerationPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestData } = location.state || {};

  const [seller, setSeller] = useState({
    name: requestData?.seller.username || "",
    link: requestData?.seller.link || "",
    authenticated: requestData?.authenticated || false,
  });

  const [product, setProduct] = useState({
    name: "",
    amount: "",
    unit: "",
    price: "",
    total_amount: "",
  });

  const [images, setImages] = useState([]);

  const handleSellerChange = (e) => {
    setSeller({ ...seller, [e.target.name]: e.target.value });
  };

  const handleProductChange = (e) => {
    setProduct({ ...product, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 10);
    setImages(files);
  };

  const handleCancel = () => navigate("/home");

  const handleSave = () => {
    // You can send to backend here
    try {
        // handle 1 product - n images as currently
    //   const requestData = {
    //     seller,
    //     product,
    //     images,
    //   };
      //
      const payload = {
        seller:{
            'username':seller.name,
            'link':seller.link
        },
        'createdBy':requestData.createdBy,
        'authenticated': seller.authenticated,
        'products':[{
            'productName':product.name,
            'amount':product.amount,
            'unit': product.unit,
            'price':product.price,
            'total_amount':product.total_amount,
            'listPicProMap':images
        }]
      }
      console.log("Saving:", payload);

      const response = api.post("/api/generator/generatePublicLink", payload);
       if (response.status === 200) {
                console.log('Generate public link successful!');
                alert("Saved successfully!");
                navigate('/home',{
                    sellerName:seller.username,
                    publicLink:response.data
                }); // Navigate after state is updated
            }
    } catch (err) {
      console.error(err);
      alert("Error saving data");
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-end mb-3">
        <button className="btn btn-success me-2" onClick={handleSave}>
          Save
        </button>
        <button className="btn btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
      </div>

      <div className="row">
        {/* Area 1: Seller Info */}
        <div className="col-md-6 mb-4">
          <h5>Seller Information</h5>
          <div className="form-group mb-2">
            <label>Name</label>
            <input
              type="text"
              className="form-control"
              name="name"
              value={seller.name}
              onChange={handleSellerChange}
            />
          </div>
          <div className="form-group mb-2">
            <label>Link</label>
            <input
              type="text"
              className="form-control"
              name="link"
              value={seller.link}
              onChange={handleSellerChange}
            />
          </div>
          <div className="form-group mb-2">
            <label>Authenticated by seller ?</label>
            <input
              type="text"
              className="form-control"
              name="authenticated"
              value={seller.authenticated}
              disabled={true}
            />
          </div>
          {/* Area 3: Image Upload */}
          <div className="mb-4">
            <h5>Upload Product Images</h5>
            <input
              type="file"
              className="form-control"
              multiple
              accept="image/*"
              onChange={handleFileChange}
            />
            <div className="d-flex flex-wrap mt-3">
              {images.map((img, idx) => (
                <div key={idx} className="me-2 mb-2">
                  <img
                    src={URL.createObjectURL(img)}
                    alt={`preview-${idx}`}
                    style={{
                      width: "80px",
                      height: "80px",
                      objectFit: "cover",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Area 2: Product Info */}
        <div className="col-md-6 mb-4">
          <h5>Product Information</h5>
          <div className="form-group mb-2">
            <label>Product Description</label>
            <textarea
              className="form-control"
              name="name"
              value={product.name}
              onChange={handleProductChange}
              rows={10}
            />
            {/* <input type="textarea" className="form-control" name="name" value={product.name} onChange={handleProductChange} /> */}
          </div>
          <div className="form-group mb-2">
            <label>Amount in unit in price (example: amount is 1 >> 1/kg/10k)</label>
            <input
              type="number"
              className="form-control"
              name="amount"
              value={product.amount}
              onChange={handleProductChange}
            />
          </div>
          <div className="form-group mb-2">
            <label>Unit</label>
            <input
              type="text"
              className="form-control"
              name="unit"
              value={product.unit}
              onChange={handleProductChange}
            />
          </div>
          <div className="form-group mb-2">
            <label>Price</label>
            <input
              type="text"
              className="form-control"
              name="price"
              value={product.price}
              onChange={handleProductChange}
            />
          </div>
          <div className="form-group mb-2">
            <label>Total amount</label>
            <input
              type="text"
              className="form-control"
              name="total_amount"
              value={product.total_amount}
              onChange={handleProductChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerationPage;
