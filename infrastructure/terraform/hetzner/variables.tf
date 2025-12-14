# Hetzner Cloud Variables

variable "control_plane_count" {
  description = "Number of control plane nodes"
  type        = number
  default     = 1
}

variable "worker_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 2
}

variable "control_plane_type" {
  description = "Server type for control plane nodes"
  type        = string
  default     = "cpx21" # 3 vCPU, 4GB RAM
}

variable "worker_type" {
  description = "Server type for worker nodes"
  type        = string
  default     = "cpx31" # 4 vCPU, 8GB RAM
}

# Pricing Reference (as of 2024):
# cpx11: 2 vCPU, 2GB RAM  - ~€4.85/mo
# cpx21: 3 vCPU, 4GB RAM  - ~€8.98/mo
# cpx31: 4 vCPU, 8GB RAM  - ~€16.49/mo
# cpx41: 8 vCPU, 16GB RAM - ~€30.49/mo
# cpx51: 16 vCPU, 32GB RAM - ~€62.99/mo




