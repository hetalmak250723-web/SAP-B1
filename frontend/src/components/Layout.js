import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import "../styles/sidebar.css";

const Layout = () => {
  return (
    <div className="app-shell">

      <Sidebar />

      <div className="app-shell__main">

        <Header />

        <div className="app-shell__content">
          <Outlet />
        </div>

      </div>

    </div>
  );
};

export default Layout;
