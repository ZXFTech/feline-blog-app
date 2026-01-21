"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import NeuInput from "@/components/NeuInput";
import Switch from "@/components/ToggleSwitch";

export interface WorkoutItemData {
  workoutItemName?: string;
  reps?: number;
  sets?: number;
  notes?: string;
  duration_minutes: number;
  calories_burned: number;
  weight_kg?: number;
}

interface AddSessionModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: WorkoutItemData) => void;
  loading?: boolean;
  activityName?: string;
}

export default function WorkoutEditor({
  visible,
  onClose,
  onSubmit,
  loading = false,
}: AddSessionModalProps) {
  const [formData, setFormData] = useState<WorkoutItemData>({
    reps: 0,
    sets: 0,
    notes: "",
    duration_minutes: 0,
    calories_burned: 0,
    workoutItemName: "",
    weight_kg: 0,
  });

  const defaultValue = {
    workoutItemName: "全身锻练",
    calories_burned: 300,
    reps: 20,
    sets: 2,
    duration_minutes: 30,
    notes: "状态不错，继续加油！",
    weight_kg: 10,
  };

  const [workoutType, setWorkoutType] = useState(true);

  const handleSubmit = () => {
    onSubmit({
      reps: formData.reps ? formData.reps : defaultValue.reps,
      sets: formData.sets ? formData.sets : defaultValue.sets,
      workoutItemName: formData.workoutItemName || defaultValue.workoutItemName,
      notes: formData.notes || defaultValue.notes,
      duration_minutes: formData.duration_minutes
        ? formData.duration_minutes
        : defaultValue.duration_minutes,
      calories_burned: formData.calories_burned
        ? formData.calories_burned
        : defaultValue.calories_burned,
    });
    setFormData({
      reps: 0,
      sets: 0,
      notes: "",
      duration_minutes: 0,
      calories_burned: 0,
      workoutItemName: "",
      weight_kg: 0,
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      onOk={handleSubmit}
      okLoading={loading}
      okText="添加训练"
      title="添加训练记录"
    >
      <div className="flex flex-col gap-2">
        <div>
          <label
            htmlFor="workout-item-name"
            className="block text-sm font-medium text-foreground mb-2"
          >
            项目名称
          </label>
          <NeuInput
            disabled={loading}
            id={defaultValue.workoutItemName}
            onChange={(e) =>
              setFormData({
                ...formData,
                workoutItemName: e.target.value,
              })
            }
            placeholder={defaultValue.workoutItemName}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <Switch
            disabled={loading}
            checked={workoutType}
            onChange={(checked) => setWorkoutType(checked)}
            label={workoutType ? "力量训练" : "有氧训练"}
          />
        </div>
        <div className="flex gap-3">
          <div className="grow">
            <label className="block text-sm font-medium text-foreground mb-2">
              时长 (分钟)
            </label>
            <NeuInput
              type="number"
              disabled={loading}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  duration_minutes: parseInt(e.target.value),
                })
              }
              placeholder={defaultValue.duration_minutes + ""}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="grow">
            <label className="block text-sm font-medium text-foreground mb-2">
              消耗 (kcal)
            </label>
            <NeuInput
              type="number"
              disabled={loading}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  calories_burned: parseInt(e.target.value),
                })
              }
              placeholder={defaultValue.calories_burned + ""}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {workoutType === true ? (
          <div className="flex gap-3">
            <div className="grow">
              <label className="block text-sm font-medium text-foreground mb-2">
                次数
              </label>
              <NeuInput
                type="number"
                disabled={loading}
                onChange={(e) =>
                  setFormData({ ...formData, reps: parseInt(e.target.value) })
                }
                placeholder={defaultValue.reps + ""}
              />
            </div>
            <div className="grow">
              <label className="block text-sm font-medium text-foreground mb-2">
                组数
              </label>
              <NeuInput
                type="number"
                disabled={loading}
                onChange={(e) =>
                  setFormData({ ...formData, sets: parseInt(e.target.value) })
                }
                placeholder={defaultValue.sets + ""}
              />
            </div>
            <div className="grow">
              <label className="block text-sm font-medium text-foreground mb-2">
                重量 (kg)
              </label>
              <NeuInput
                type="number"
                disabled={loading}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    weight_kg: parseInt(e.target.value),
                  })
                }
                placeholder={defaultValue.weight_kg + ""}
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Notes
          </label>
          <NeuInput
            textArea
            disabled={loading}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            placeholder={defaultValue.notes}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}
