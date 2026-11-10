/** Dining content — DEMONSTRATION CONTENT. Hours are illustrative. */
import { IMAGES } from "./images.js";

export const MEALS = [
  {
    id: "breakfast",
    label: "Breakfast",
    title: "Begin without a schedule.",
    image: IMAGES.breakfast,
    text:
      "Fruit from nearby growers, breads baked each morning, eggs prepared to order and strong Kenyan coffee. Served in the dining room or on your terrace.",
  },
  {
    id: "lunch",
    label: "Lunch",
    title: "Light, local, long.",
    image: IMAGES.lunch,
    text:
      "A short midday menu built around what the garden and neighbouring farms are offering — designed to be shared, and to leave the afternoon open.",
  },
  {
    id: "dinner",
    label: "Dinner",
    title: "An evening, properly taken.",
    image: IMAGES.dinner,
    text:
      "Three or four courses cooked over fire and slow heat, paced to the evening rather than the kitchen. Candlelit, unhurried, and quiet enough to talk.",
  },
  {
    id: "seasonal",
    label: "Seasonal dining",
    title: "The menu follows the year.",
    image: IMAGES.seasonal,
    text:
      "Menus change with the rains and the harvest. Seasonal evenings and guest-cook collaborations are announced to guests in advance.",
  },
];

export const HOURS = [
  { service: "Breakfast", time: "07:00 – 10:30" },
  { service: "Lunch", time: "12:30 – 15:00" },
  { service: "Afternoon tea", time: "15:30 – 17:00" },
  { service: "Dinner", time: "19:00 – 21:30" },
];
