//! Byte-order reading macros shared across parsers.
//!
//! These macros simplify reading integer values with runtime-determined endianness.

/// Read an i32 with the specified byte order.
#[macro_export]
macro_rules! read_i32_with_order {
    ($reader:expr, $byte_order:expr) => {
        match $byte_order {
            $crate::segy::ByteOrder::BigEndian => $reader.read_i32::<byteorder::BigEndian>()?,
            $crate::segy::ByteOrder::LittleEndian => {
                $reader.read_i32::<byteorder::LittleEndian>()?
            }
        }
    };
}

/// Read an i16 with the specified byte order.
#[macro_export]
macro_rules! read_i16_with_order {
    ($reader:expr, $byte_order:expr) => {
        match $byte_order {
            $crate::segy::ByteOrder::BigEndian => $reader.read_i16::<byteorder::BigEndian>()?,
            $crate::segy::ByteOrder::LittleEndian => {
                $reader.read_i16::<byteorder::LittleEndian>()?
            }
        }
    };
}
