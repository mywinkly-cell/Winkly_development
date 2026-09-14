import React from "react";
import { View } from "react-native";
import { Slider as FilterSlider } from "react-native-range-slider-expo";
import { useAppTheme } from "@/constants/design-system";
import {
  FILTER_SLIDER_CONTAINER_STYLE,
  FILTER_SLIDER_KNOB_SIZE,
  FILTER_SLIDER_WRAP_STYLE,
} from "@/lib/filters/filterSliderStyle";

type FilterDistanceSliderProps = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  primaryColor: string;
};

export function FilterDistanceSlider({
  min,
  max,
  step,
  value,
  onChange,
  primaryColor,
}: FilterDistanceSliderProps) {
  const theme = useAppTheme();
  return (
    <View style={FILTER_SLIDER_WRAP_STYLE}>
      <FilterSlider
        min={min}
        max={max}
        step={step}
        initialValue={value}
        valueOnChange={onChange}
        styleSize={FILTER_SLIDER_KNOB_SIZE}
        knobColor={primaryColor}
        inRangeBarColor={primaryColor}
        outOfRangeBarColor={theme.colors.border}
        showRangeLabels={false}
        showValueLabels={false}
        containerStyle={FILTER_SLIDER_CONTAINER_STYLE}
      />
    </View>
  );
}
