import { useEffect, useState } from "react";
import {
  Button,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Radio,
  Box,
} from "@mui/material";
import { AddIcon, DomainIcon } from "@b4.icons";
import { B4Alert } from "@b4.elements";
import { colors } from "@design";
import { B4Dialog } from "@common/B4Dialog";
import { B4Badge } from "@common/B4Badge";
import { B4SetConfig, NEW_SET_ID } from "@models/config";
import { SetSelector } from "@common/SetSelector";

interface AddSniModalProps {
  open: boolean;
  domain: string;
  variants: string[];
  selected: string;
  sets: B4SetConfig[];
  createNewSet?: boolean;
  onClose: () => void;
  onSelectVariant: (variant: string) => void;
  onAdd: (setId: string, setName?: string) => void;
}

export const AddSniModal = ({
  open,
  domain,
  variants,
  selected,
  sets,
  createNewSet = false,
  onClose,
  onSelectVariant,
  onAdd,
}: AddSniModalProps) => {
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [setName, setSetName] = useState<string>("");

  const handleAdd = () => {
    onAdd(selectedSetId, setName);
  };

  useEffect(() => {
    if (open) {
      if (createNewSet) {
        setSelectedSetId(NEW_SET_ID);
      } else if (sets.length > 0) {
        const firstEnabled = sets.find((s) => s.enabled);
        setSelectedSetId(firstEnabled?.id ?? sets[0]?.id ?? "");
      }
    }
  }, [open, sets, createNewSet]);

  return (
    <B4Dialog
      title="Add Domain to Manual List"
      icon={<DomainIcon />}
      open={open}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={handleAdd}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!selected || !selectedSetId}
          >
            Add Domain
          </Button>
        </>
      }
    >
      <>
        <B4Alert severity="info" sx={{ mb: 2 }}>
          Select which domain pattern to add to the manual domains list. More
          specific patterns will only match exact subdomains, while broader
          patterns will match all subdomains.
        </B4Alert>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Original domain: <B4Badge label={domain} color="primary" />
        </Typography>
        {!createNewSet && sets.length > 0 && (
          <SetSelector
            sets={sets}
            value={selectedSetId}
            onChange={(setId, name) => {
              setSelectedSetId(setId);
              if (name) setSetName(name);
            }}
          />
        )}
        <List>
          {variants.map((variant, index) => (
            <ListItem key={variant} disablePadding>
              <ListItemButton
                onClick={() => onSelectVariant(variant)}
                selected={selected === variant}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  "&.Mui-selected": {
                    bgcolor: colors.accent.primary,
                    "&:hover": {
                      bgcolor: colors.accent.primaryHover,
                    },
                  },
                }}
              >
                <ListItemIcon>
                  <Radio
                    checked={selected === variant}
                    sx={{
                      color: colors.border.default,
                      "&.Mui-checked": {
                        color: colors.primary,
                      },
                    }}
                  />
                </ListItemIcon>
                {(() => {
                  let secondaryText: string;
                  if (index === 0) {
                    secondaryText = "Most specific - exact match only";
                  } else if (index === variants.length - 1) {
                    secondaryText = "Broadest - matches all subdomains";
                  } else {
                    secondaryText = "Intermediate specificity";
                  }
                  return (
                    <ListItemText primary={variant} secondary={secondaryText} />
                  );
                })()}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </>
    </B4Dialog>
  );
};
