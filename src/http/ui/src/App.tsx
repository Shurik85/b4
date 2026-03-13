import {
  AppBar,
  Badge,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ThemeProvider,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { useTranslation } from "react-i18next";

import {
  ConnectionIcon,
  CoreIcon,
  DashboardIcon,
  DiscoveryIcon,
  LogsIcon,
  LogoutIcon,
  MenuIcon,
  SecurityIcon,
  SetsIcon,
} from "@b4.icons";
import { colors, theme } from "@design";
import { useAuth } from "@context/AuthProvider";
import { LoginPage } from "@components/auth/LoginPage";

import { Logo } from "@common/Logo";
import Version from "@components/version/Version";

import { useWebSocket } from "./context/B4WsProvider";

import { ConnectionsPage } from "@b4.connections";
import { DashboardPage } from "@b4.dashboard";
import { DetectorPage } from "@b4.detector";
import { DiscoveryPage } from "@b4.discovery";
import { LogsPage } from "@b4.logs";
import { SetsPage } from "@b4.sets";
import { SettingsPage } from "@b4.settings";
import { SnackbarProvider } from "@context/SnackbarProvider";

const DRAWER_WIDTH = 240;

interface NavItem {
  path: string;
  labelKey: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: "/dashboard", labelKey: "core.nav.dashboard", icon: <DashboardIcon /> },
  { path: "/sets", labelKey: "core.nav.sets", icon: <SetsIcon /> },
  { path: "/discovery", labelKey: "core.nav.discovery", icon: <DiscoveryIcon /> },
  { path: "/detector", labelKey: "core.nav.detector", icon: <SecurityIcon /> },
  { path: "/connections", labelKey: "core.nav.connections", icon: <ConnectionIcon /> },
  { path: "/logs", labelKey: "core.nav.logs", icon: <LogsIcon /> },
  { path: "/settings", labelKey: "core.nav.settings", icon: <CoreIcon /> },
];

export default function App() {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { unseenDomainsCount, resetDomainsBadge } = useWebSocket();
  const { isAuthenticated, isLoading, authRequired, logout } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return null;
  }

  if (authRequired && !isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage />
      </ThemeProvider>
    );
  }

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith("/dashboard")) return t("core.nav.dashboard");
    if (path.startsWith("/sets")) return t("core.nav.sets");
    if (path.startsWith("/connections")) return t("core.nav.connections");
    if (path.startsWith("/discovery")) return t("core.nav.discovery");
    if (path.startsWith("/logs")) return t("core.nav.logs");
    if (path.startsWith("/detector")) return t("core.nav.detector");
    if (path.startsWith("/settings")) return t("core.nav.settings");
    return t("core.nav.discovery");
  };

  const isNavItemSelected = (navPath: string) => {
    if (navPath === "/settings" || navPath === "/sets") {
      return location.pathname.startsWith(navPath);
    }
    return location.pathname === navPath;
  };

  return (
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <CssBaseline />
        <Box sx={{ display: "flex", height: "100vh" }}>
          <Drawer
            variant="persistent"
            open={drawerOpen}
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              "& .MuiDrawer-paper": {
                width: DRAWER_WIDTH,
                boxSizing: "border-box",
              },
            }}
          >
            <Toolbar>
              <Logo />
            </Toolbar>
            <Divider sx={{ borderColor: colors.border.default }} />
            <List>
              {navItems.map((item) => {
                let targetCount = 0;
                if (item.path === "/connections" && unseenDomainsCount > 0) {
                  targetCount = unseenDomainsCount;
                }

                return (
                  <ListItem key={item.path} disablePadding>
                    <ListItemButton
                      selected={isNavItemSelected(item.path)}
                      onClick={() => {
                        if (item.path === "/connections") {
                          resetDomainsBadge();
                        }
                        navigate(item.path)?.catch(() => {});
                      }}
                      sx={{
                        "&.Mui-selected": {
                          backgroundColor: colors.accent.primary,
                          "&:hover": {
                            backgroundColor: colors.accent.primaryHover,
                          },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ color: "inherit" }}>
                        {targetCount > 0 ? (
                          <Badge
                            badgeContent={targetCount}
                            color="secondary"
                            max={999}
                          >
                            {item.icon}
                          </Badge>
                        ) : (
                          item.icon
                        )}
                      </ListItemIcon>
                      <ListItemText primary={t(item.labelKey)} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
            <Box sx={{ flexGrow: 1 }} />
            <Version />
          </Drawer>

          <Box
            component="main"
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              height: "100vh",
              ml: drawerOpen ? 0 : `-${DRAWER_WIDTH}px`,
              transition: theme.transitions.create("margin", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            }}
          >
            <AppBar position="static" elevation={0}>
              <Toolbar>
                <IconButton
                  color="inherit"
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  edge="start"
                  sx={{ mr: 2 }}
                >
                  <MenuIcon />
                </IconButton>
                <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
                  {getPageTitle()}
                </Typography>
                {authRequired && (
                  <IconButton color="inherit" onClick={logout} title={t("core.logout")}>
                    <LogoutIcon />
                  </IconButton>
                )}
              </Toolbar>
            </AppBar>

            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sets/*" element={<SetsPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/discovery" element={<DiscoveryPage />} />
              <Route path="/detector" element={<DetectorPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings/*" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Box>
        </Box>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
