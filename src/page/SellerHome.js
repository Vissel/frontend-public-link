import { useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import { useLocation } from "react-router-dom";
const SellerHome = () => {
    const [username,setUsername] = useState('');
    const {state} = useLocation();

    useEffect(()=>{
        setUsername(state.username);
    });
  return (
    <Container className="container mt-5">
      <h1>
        Welcome to home page: {username}
      </h1>
    </Container>
  );
};

export default SellerHome;
